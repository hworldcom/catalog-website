import {
  ClassifierAssistedUploadDisabledError,
  classifierAssistedUploadDisabledResponse,
} from "../classifier-assisted-upload";
import { z } from "zod";

const classifierGateVariable = "BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED";
const releaseEnvironmentSchema = z.object({
  BAZORIA_DEPLOYMENT_ENVIRONMENT: z.enum(["local", "uat", "production"]),
  BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: z.enum(["true", "false"]).optional(),
});
const explicitlyForbiddenClassifierVariables = new Set([
  "BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID",
  "BAZORIA_DEFAULT_SELLER_ID",
]);

export type ClassifierAssistedUploadReleaseState = {
  environment: "local" | "uat" | "production";
  enabled: boolean;
};

export class ClassifierAssistedUploadConfigurationError extends Error {
  constructor(details: string) {
    super(`classifier_assisted_upload_configuration_invalid: ${details}`);
    this.name = "ClassifierAssistedUploadConfigurationError";
  }
}

export function readClassifierAssistedUploadReleaseState(
  environment: Record<string, string | undefined> = process.env,
): ClassifierAssistedUploadReleaseState {
  const parsed = releaseEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw invalidConfiguration(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  const deploymentEnvironment = parsed.data.BAZORIA_DEPLOYMENT_ENVIRONMENT;
  const classifierSetting = parsed.data.BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED;
  if (deploymentEnvironment !== "local") {
    if (classifierSetting !== "false") {
      throw invalidConfiguration([
        `${classifierGateVariable}: ${classifierSetting === undefined ? "Required" : "must be false"}`,
      ]);
    }

    const forbiddenVariables = Object.entries(environment)
      .filter(([name, value]) => isForbiddenClassifierVariable(name) && Boolean(value?.trim()))
      .map(([name]) => name)
      .sort();
    if (forbiddenVariables.length > 0) {
      throw invalidConfiguration(
        forbiddenVariables.map((name) => `${name}: must be absent in deployed environments`),
      );
    }
  }

  return {
    environment: deploymentEnvironment,
    enabled: classifierSetting === "true",
  };
}

export function assertClassifierAssistedUploadEnabled(
  environment: Record<string, string | undefined> = process.env,
): void {
  if (!readClassifierAssistedUploadReleaseState(environment).enabled) {
    throw new ClassifierAssistedUploadDisabledError();
  }
}

export function classifierAssistedUploadGateResponse(
  environment: Record<string, string | undefined> = process.env,
): Response | null {
  try {
    assertClassifierAssistedUploadEnabled(environment);
    return null;
  } catch (error) {
    if (error instanceof ClassifierAssistedUploadDisabledError) {
      return classifierAssistedUploadDisabledResponse();
    }
    throw error;
  }
}

export async function validateClassifierAssistedUploadStartup(
  environment: Record<string, string | undefined> = process.env,
): Promise<void> {
  const release = readClassifierAssistedUploadReleaseState(environment);
  if (!release.enabled) return;

  const [{ readSellerClassifierBatchConfig }, { readClassifierImportConfig }] = await Promise.all([
    import("@/features/seller-classifier/server/seller-classifier-batch.config"),
    import("@/features/admin/server/classifier-import.config"),
  ]);
  readSellerClassifierBatchConfig(environment);
  readClassifierImportConfig(environment);
}

function isForbiddenClassifierVariable(name: string): boolean {
  return (
    (name.startsWith("BAZORIA_CLASSIFIER_") && name !== classifierGateVariable) ||
    explicitlyForbiddenClassifierVariables.has(name)
  );
}

function invalidConfiguration(details: string[]): ClassifierAssistedUploadConfigurationError {
  return new ClassifierAssistedUploadConfigurationError(details.join("; "));
}
