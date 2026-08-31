import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readRuntimeIdentity,
  writeRuntimeStartupLog,
} from "@/features/runtime/server/runtime-identity";
import { GoogleTaskIdentityVerifier } from "./product-activation.task-identity";
import {
  readProductActivationWorkerConfig,
  type ProductActivationWorkerConfig,
} from "./product-activation.worker-config";
import { createProductActivationTaskRuntimeDependencies } from "./product-activation.worker-runtime";
import {
  ProductActivationWorkerService,
  writeProductActivationWorkerLog,
  type ProductActivationWorkerRequest,
  type ProductActivationWorkerResponse,
} from "./product-activation.worker-service";

export const PRODUCT_ACTIVATION_SHUTDOWN_DRAIN_MS = 9_000;

export type ProductActivationWorkerProcess = {
  port: number;
  service: ProductActivationWorkerService;
  shutdown(): Promise<void>;
};

export type ProductActivationWorkerProcessDependencies = {
  config?: ProductActivationWorkerConfig;
  service?: ProductActivationWorkerService;
};

export async function startProductActivationWorkerProcess(
  dependencies: ProductActivationWorkerProcessDependencies = {},
): Promise<ProductActivationWorkerProcess> {
  const config = dependencies.config ?? readProductActivationWorkerConfig();
  const service = dependencies.service ?? createService(config);
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    void handleNodeRequest(service, request, response);
  });
  server.requestTimeout = config.workerDeadlineMs + 30_000;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await listen(server, config.port);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Worker address unavailable.");

  let shutdownPromise: Promise<void> | null = null;
  return {
    port: address.port,
    service,
    shutdown() {
      shutdownPromise ??= shutdown(server, service, sockets);
      return shutdownPromise;
    },
  };
}

function createService(config: ProductActivationWorkerConfig): ProductActivationWorkerService {
  return new ProductActivationWorkerService({
    ...createProductActivationTaskRuntimeDependencies(config),
    identityVerifier: new GoogleTaskIdentityVerifier(config.taskAudience),
    expectedServiceAccount: config.taskServiceAccount,
  });
}

async function handleNodeRequest(
  service: ProductActivationWorkerService,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const result = await service.handle(toWorkerRequest(request));
    writeNodeResponse(response, result);
  } catch {
    writeProductActivationWorkerLog({
      event: "product_activation_task_finished",
      severity: "error",
      outcome: "http_handler_exception",
      durationMs: 0,
      errorCode: "product_moderation_activation_unavailable",
    });
    writeNodeResponse(response, { statusCode: 503 });
  }
}

function toWorkerRequest(request: IncomingMessage): ProductActivationWorkerRequest {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, value);
  }
  return {
    method: request.method ?? "",
    pathname: new URL(request.url ?? "/", "http://worker.internal").pathname,
    headers,
    body: request,
  };
}

function writeNodeResponse(
  response: ServerResponse,
  result: ProductActivationWorkerResponse,
): void {
  response.statusCode = result.statusCode;
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    response.setHeader(name, value);
  }
  response.end();
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", onError);
      resolve();
    });
  });
}

async function shutdown(
  server: Server,
  service: ProductActivationWorkerService,
  sockets: Set<Socket>,
): Promise<void> {
  service.beginShutdown();
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  const deadline = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      resolve();
    }, PRODUCT_ACTIVATION_SHUTDOWN_DRAIN_MS);
    timeout.unref();
    closed.then(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await Promise.race([closed, deadline]);
}

async function main(): Promise<void> {
  let config: ProductActivationWorkerConfig;
  try {
    config = readProductActivationWorkerConfig();
  } catch {
    writeStartupFailure("product_publication_configuration_invalid");
    process.exitCode = 1;
    return;
  }

  let workerProcess: ProductActivationWorkerProcess;
  try {
    workerProcess = await startProductActivationWorkerProcess({ config });
  } catch {
    writeStartupFailure("product_moderation_activation_unavailable");
    process.exitCode = 1;
    return;
  }
  writeRuntimeStartupLog(readRuntimeIdentity("product-activation-worker"));

  let signalCount = 0;
  const handleSignal = () => {
    signalCount += 1;
    if (signalCount > 1) process.exit(130);
    void workerProcess.shutdown().finally(() => process.exit(0));
  };
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
}

function writeStartupFailure(errorCode: string): void {
  writeProductActivationWorkerLog({
    event: "product_activation_task_finished",
    severity: "error",
    outcome: "startup_failed",
    durationMs: 0,
    errorCode,
  });
}

const entryPath = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;
if (entryPath) void main();
