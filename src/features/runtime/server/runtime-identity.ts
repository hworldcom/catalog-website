import { z } from "zod";

import type { DeploymentEnvironment } from "@/lib/runtime-public-config";

export type RuntimeRole = "web" | "product-activation-worker" | "product-activation-reconciliation";

export type RuntimeIdentity = {
  role: RuntimeRole;
  environment: DeploymentEnvironment;
  releaseCommit: string;
  buildId: string;
  cloudRunRevision: string | null;
};

const optionalMetadata = z.string().trim().min(1).max(200).optional();
const identityEnvironmentSchema = z.object({
  BAZORIA_DEPLOYMENT_ENVIRONMENT: z.enum(["local", "uat", "production"]),
  BAZORIA_RELEASE_COMMIT: optionalMetadata,
  BAZORIA_BUILD_ID: optionalMetadata,
  K_REVISION: optionalMetadata,
});

export function readRuntimeIdentity(
  role: RuntimeRole,
  environment: Record<string, string | undefined> = process.env,
): RuntimeIdentity {
  const parsed = identityEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`runtime_identity_configuration_invalid: ${details}`);
  }

  return {
    role,
    environment: parsed.data.BAZORIA_DEPLOYMENT_ENVIRONMENT,
    releaseCommit: parsed.data.BAZORIA_RELEASE_COMMIT ?? "unknown",
    buildId: parsed.data.BAZORIA_BUILD_ID ?? "development",
    cloudRunRevision: parsed.data.K_REVISION ?? null,
  };
}

export function writeRuntimeStartupLog(identity: RuntimeIdentity): void {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "bazoria_runtime",
      event: "runtime_role_started",
      severity: "info",
      ...identity,
    })}\n`,
  );
}
