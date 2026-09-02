import type { TaskIdentityVerifier } from "./product-activation.task-identity";
import type { ProductActivationRepository } from "./product-activation.repository";
import {
  ProductActivationError,
  productActivationDispatchPayloadSchema,
  type ProductActivationDispatchPayload,
  type ProductActivationWorkerResult,
} from "./product-activation.types";
import type { ProductActivationTaskRuntimeDependencies } from "./product-activation.worker-runtime";

export const PRODUCT_ACTIVATION_TASK_PATH = "/internal/tasks/activate-product-submission";
export const PRODUCT_ACTIVATION_HEALTH_PATH = "/health";
export const PRODUCT_ACTIVATION_TASK_BODY_LIMIT_BYTES = 4_096;

export type ProductActivationWorkerRequest = {
  method: string;
  pathname: string;
  headers: Headers;
  body: AsyncIterable<Uint8Array>;
};

export type ProductActivationWorkerResponse = {
  statusCode: 204 | 401 | 403 | 404 | 405 | 503;
  headers?: Record<string, string>;
};

export type ProductActivationWorkerLog = {
  event:
    | "product_activation_worker_unauthorized"
    | "product_activation_task_invalid"
    | "product_activation_task_finished";
  severity: "info" | "warning" | "error";
  runId?: string;
  dispatchGeneration?: number;
  outcome: string;
  durationMs: number;
  errorCode?: string;
  retryCount?: number;
  retryLimitReached?: boolean;
};

export type ProductActivationWorkerServiceDependencies =
  ProductActivationTaskRuntimeDependencies & {
    identityVerifier: TaskIdentityVerifier;
    deploymentEnvironment: "local" | "uat" | "production";
    expectedServiceAccount: string;
    taskMaximumAttempts: number;
    log?: (entry: ProductActivationWorkerLog) => void;
    now?: () => number;
  };

const PERMANENT_DISPATCH_ERRORS = new Set([
  "product_moderation_not_found",
  "product_moderation_submission_stale",
  "product_activation_dispatch_not_allowed",
  "product_activation_dispatch_invalid",
]);

export class ProductActivationWorkerService {
  private ready = true;
  private activeTask: Promise<void> | null = null;
  private readonly log: (entry: ProductActivationWorkerLog) => void;
  private readonly now: () => number;

  constructor(private readonly dependencies: ProductActivationWorkerServiceDependencies) {
    this.log = dependencies.log ?? writeProductActivationWorkerLog;
    this.now = dependencies.now ?? Date.now;
  }

  async handle(request: ProductActivationWorkerRequest): Promise<ProductActivationWorkerResponse> {
    if (
      request.pathname !== PRODUCT_ACTIVATION_HEALTH_PATH &&
      request.pathname !== PRODUCT_ACTIVATION_TASK_PATH
    ) {
      return { statusCode: 404 };
    }
    if (request.pathname === PRODUCT_ACTIVATION_HEALTH_PATH) {
      if (request.method !== "GET") return { statusCode: 405, headers: { Allow: "GET" } };
      return { statusCode: this.ready ? 204 : 503 };
    }
    if (request.method !== "POST") return { statusCode: 405, headers: { Allow: "POST" } };

    const startedAt = this.now();
    const identity = await this.authenticate(request.headers, startedAt);
    if (identity.statusCode) return identity;
    const retry = this.readRetryContext(request.headers, startedAt);
    if ("statusCode" in retry) return retry;
    if (!this.ready) return this.unavailable(startedAt, "shutting_down", retry);

    const payload = await this.readPayload(request, startedAt, retry);
    if (!("runId" in payload)) return payload;
    if (!this.ready) return this.unavailable(startedAt, "shutting_down", retry, payload);
    if (this.activeTask) return this.unavailable(startedAt, "process_busy", retry, payload);

    let releaseActive!: () => void;
    const active = new Promise<void>((resolve) => {
      releaseActive = resolve;
    });
    this.activeTask = active;
    try {
      return await this.execute(payload, startedAt, retry);
    } finally {
      releaseActive();
      if (this.activeTask === active) this.activeTask = null;
    }
  }

  beginShutdown(): void {
    this.ready = false;
  }

  waitForIdle(): Promise<void> {
    return this.activeTask ?? Promise.resolve();
  }

  private async authenticate(
    headers: Headers,
    startedAt: number,
  ): Promise<ProductActivationWorkerResponse | { statusCode?: undefined }> {
    const match = /^Bearer\s+(\S+)$/i.exec(headers.get("authorization") ?? "");
    if (!match) return this.unauthorized(401, startedAt, "missing_or_invalid_token");
    try {
      const identity = await this.dependencies.identityVerifier.verify(match[1]!);
      if (identity.email !== this.dependencies.expectedServiceAccount) {
        return this.unauthorized(403, startedAt, "unexpected_service_account");
      }
      return {};
    } catch {
      return this.unauthorized(401, startedAt, "invalid_token");
    }
  }

  private async readPayload(
    request: ProductActivationWorkerRequest,
    startedAt: number,
    retry: ProductActivationRetryContext,
  ): Promise<ProductActivationDispatchPayload | ProductActivationWorkerResponse> {
    if (!isJsonContentType(request.headers.get("content-type"))) {
      return this.invalid(startedAt, "unsupported_content_type");
    }

    const declaredLength = request.headers.get("content-length");
    if (declaredLength !== null) {
      if (!/^\d+$/.test(declaredLength)) return this.invalid(startedAt, "invalid_content_length");
      if (Number(declaredLength) > PRODUCT_ACTIVATION_TASK_BODY_LIMIT_BYTES) {
        return this.invalid(startedAt, "declared_body_too_large");
      }
    }

    let body: Uint8Array;
    try {
      body = await readBoundedBody(request.body, PRODUCT_ACTIVATION_TASK_BODY_LIMIT_BYTES);
    } catch (error) {
      if (error instanceof ProductActivationTaskBodyTooLargeError) {
        return this.invalid(startedAt, "streamed_body_too_large");
      }
      return this.unavailable(startedAt, "body_read_failed", retry);
    }

    let value: unknown;
    try {
      value = JSON.parse(Buffer.from(body).toString("utf8"));
    } catch {
      return this.invalid(startedAt, "malformed_json");
    }
    const parsed = productActivationDispatchPayloadSchema.safeParse(value);
    if (!parsed.success) return this.invalid(startedAt, "invalid_payload");
    return parsed.data;
  }

  private async execute(
    payload: ProductActivationDispatchPayload,
    startedAt: number,
    retry: ProductActivationRetryContext,
  ): Promise<ProductActivationWorkerResponse> {
    let repository: Pick<ProductActivationRepository, "recordDispatchResult">;
    try {
      repository = await this.dependencies.getRepository();
      const repair = await repository.recordDispatchResult({ ...payload, result: "dispatched" });
      if (
        (repair.result !== "recorded" && repair.result !== "replay") ||
        repair.dispatchStatus !== "dispatched"
      ) {
        return this.finished(payload, startedAt, "dispatch_no_work", retry, 204);
      }
    } catch (error) {
      if (error instanceof ProductActivationError && PERMANENT_DISPATCH_ERRORS.has(error.code)) {
        return this.finished(payload, startedAt, "dispatch_no_work", retry, 204, error.code);
      }
      return this.unavailable(startedAt, "dispatch_repair_failed", retry, payload);
    }

    try {
      const worker = await this.dependencies.createWorker();
      const result = await worker.run(payload);
      return mapWorkerResult(result) === 204
        ? this.finished(
            payload,
            startedAt,
            result.status,
            retry,
            204,
            "errorCode" in result ? result.errorCode : undefined,
          )
        : this.unavailable(startedAt, result.status, retry, payload);
    } catch {
      return this.unavailable(startedAt, "worker_exception", retry, payload);
    }
  }

  private unauthorized(
    statusCode: 401 | 403,
    startedAt: number,
    outcome: string,
  ): ProductActivationWorkerResponse {
    this.log({
      event: "product_activation_worker_unauthorized",
      severity: "warning",
      outcome,
      durationMs: this.duration(startedAt),
      errorCode: "product_activation_worker_unauthorized",
    });
    return { statusCode };
  }

  private invalid(startedAt: number, outcome: string): ProductActivationWorkerResponse {
    this.log({
      event: "product_activation_task_invalid",
      severity: "warning",
      outcome,
      durationMs: this.duration(startedAt),
      errorCode: "product_activation_task_invalid",
    });
    return { statusCode: 204 };
  }

  private unavailable(
    startedAt: number,
    outcome: string,
    retry: ProductActivationRetryContext,
    payload?: ProductActivationDispatchPayload,
  ): ProductActivationWorkerResponse {
    this.log({
      event: "product_activation_task_finished",
      severity: "error",
      ...payload,
      outcome,
      durationMs: this.duration(startedAt),
      errorCode: "product_moderation_activation_unavailable",
      retryCount: retry.retryCount,
      retryLimitReached: retry.retryCount >= this.dependencies.taskMaximumAttempts - 1,
    });
    return { statusCode: 503 };
  }

  private finished(
    payload: ProductActivationDispatchPayload,
    startedAt: number,
    outcome: string,
    retry: ProductActivationRetryContext,
    statusCode: 204,
    errorCode?: string,
  ): ProductActivationWorkerResponse {
    this.log({
      event: "product_activation_task_finished",
      severity: "info",
      ...payload,
      outcome,
      durationMs: this.duration(startedAt),
      retryCount: retry.retryCount,
      retryLimitReached: false,
      ...(errorCode ? { errorCode } : {}),
    });
    return { statusCode };
  }

  private duration(startedAt: number): number {
    return Math.max(0, this.now() - startedAt);
  }

  private readRetryContext(
    headers: Headers,
    startedAt: number,
  ): ProductActivationRetryContext | ProductActivationWorkerResponse {
    const value = headers.get("x-cloudtasks-taskretrycount");
    if (value === null && this.dependencies.deploymentEnvironment === "local") {
      return { retryCount: 0 };
    }
    if (value === null || !/^\d+$/.test(value)) {
      return this.invalidRetryCount(
        startedAt,
        value === null ? "missing_retry_count" : "invalid_retry_count",
      );
    }
    const retryCount = Number(value);
    if (!Number.isSafeInteger(retryCount)) {
      return this.invalidRetryCount(startedAt, "invalid_retry_count");
    }
    return { retryCount };
  }

  private invalidRetryCount(
    startedAt: number,
    outcome: "missing_retry_count" | "invalid_retry_count",
  ): ProductActivationWorkerResponse {
    this.log({
      event: "product_activation_task_invalid",
      severity: "error",
      outcome,
      durationMs: this.duration(startedAt),
      errorCode: "product_activation_task_invalid",
    });
    return { statusCode: 503 };
  }
}

type ProductActivationRetryContext = {
  retryCount: number;
};

class ProductActivationTaskBodyTooLargeError extends Error {}

async function readBoundedBody(
  body: AsyncIterable<Uint8Array>,
  limit: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > limit) throw new ProductActivationTaskBodyTooLargeError();
    chunks.push(chunk);
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    size,
  );
}

function isJsonContentType(value: string | null): boolean {
  return value?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function mapWorkerResult(result: ProductActivationWorkerResult): 204 | 503 {
  return ["already_owned", "claim_lost", "cleanup_pending"].includes(result.status) ? 503 : 204;
}

export function writeProductActivationWorkerLog(entry: ProductActivationWorkerLog): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "bazoria_product_activation_worker",
    ...entry,
  });
  if (entry.severity === "error") {
    console.error(line);
  } else if (entry.severity === "warning") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
