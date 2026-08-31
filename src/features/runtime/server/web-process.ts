import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readProductActivationConfig } from "@/features/admin/server/product-activation.config";
import { validateClassifierAssistedUploadStartup } from "@/features/classifier-release/server/classifier-assisted-upload-gate";
import { readRuntimePublicConfig } from "@/lib/runtime-public-config.server";

import { readRuntimeIdentity, writeRuntimeStartupLog } from "./runtime-identity";

export type WebProcessDependencies = {
  environment?: Record<string, string | undefined>;
  importServer?: () => Promise<unknown>;
};

export async function startWebProcess(dependencies: WebProcessDependencies = {}): Promise<void> {
  const environment = dependencies.environment ?? process.env;
  readRuntimePublicConfig(environment);
  await validateClassifierAssistedUploadStartup(environment);
  readProductActivationConfig(environment);

  await (dependencies.importServer ?? importCompiledNitroServer)();
  writeRuntimeStartupLog(readRuntimeIdentity("web", environment));
}

async function importCompiledNitroServer(): Promise<unknown> {
  const serverUrl = new URL("../server/index.mjs", import.meta.url);
  return import(serverUrl.href);
}

const entryPath = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;
if (entryPath) {
  void startWebProcess().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "bazoria_runtime",
        event: "runtime_role_startup_failed",
        severity: "error",
        role: "web",
        errorCode: "web_runtime_configuration_invalid",
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
