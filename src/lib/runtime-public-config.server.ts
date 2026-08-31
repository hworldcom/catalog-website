import { z } from "zod";

import {
  parseRuntimePublicConfig,
  RuntimePublicConfigurationError,
  type RuntimePublicConfig,
} from "./runtime-public-config";
import { resolvePublicSiteOrigin } from "./public-site-origin";
import {
  ClassifierAssistedUploadConfigurationError,
  readClassifierAssistedUploadReleaseState,
} from "@/features/classifier-release/server/classifier-assisted-upload-gate";

const environmentSchema = z.object({
  BAZORIA_DEPLOYMENT_ENVIRONMENT: z.enum(["local", "uat", "production"]),
  SUPABASE_URL: z.string().trim().min(1),
  SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
});

export function readRuntimePublicConfig(
  environment: Record<string, string | undefined> = process.env,
): RuntimePublicConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) throw invalidConfiguration(parsed.error.issues);

  let classifierAssistedUploadEnabled: boolean;
  try {
    classifierAssistedUploadEnabled = readClassifierAssistedUploadReleaseState(environment).enabled;
  } catch (error) {
    if (error instanceof ClassifierAssistedUploadConfigurationError) {
      throw new RuntimePublicConfigurationError(
        `runtime_public_configuration_invalid: ${error.message}`,
      );
    }
    throw error;
  }

  let canonicalSiteOrigin: string;
  try {
    canonicalSiteOrigin = resolvePublicSiteOrigin(environment);
  } catch (error) {
    throw new RuntimePublicConfigurationError(
      `runtime_public_configuration_invalid: ${
        error instanceof Error ? error.message : "canonical site origin is invalid"
      }`,
    );
  }

  const googleSignInEnabled = readGoogleSignInEnabled(environment);

  try {
    return parseRuntimePublicConfig({
      environment: parsed.data.BAZORIA_DEPLOYMENT_ENVIRONMENT,
      supabaseUrl: parsed.data.SUPABASE_URL,
      supabasePublishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY,
      classifierAssistedUploadEnabled,
      canonicalSiteOrigin,
      googleSignInEnabled,
    });
  } catch {
    throw new RuntimePublicConfigurationError(
      "runtime_public_configuration_invalid: browser-safe configuration is invalid",
    );
  }
}

function readGoogleSignInEnabled(environment: Record<string, string | undefined>): boolean {
  const configured = environment.BAZORIA_GOOGLE_SIGN_IN_ENABLED?.trim();
  if (!configured || configured === "false") return false;
  if (configured === "true") return true;
  throw new RuntimePublicConfigurationError(
    "runtime_public_configuration_invalid: BAZORIA_GOOGLE_SIGN_IN_ENABLED must be true or false",
  );
}

function invalidConfiguration(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): RuntimePublicConfigurationError {
  const details = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  return new RuntimePublicConfigurationError(`runtime_public_configuration_invalid: ${details}`);
}
