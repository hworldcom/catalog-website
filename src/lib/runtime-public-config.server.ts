import { z } from "zod";

import {
  parseRuntimePublicConfig,
  RuntimePublicConfigurationError,
  type RuntimePublicConfig,
} from "./runtime-public-config";

const environmentSchema = z.object({
  BAZORIA_DEPLOYMENT_ENVIRONMENT: z.enum(["local", "uat", "production"]),
  SUPABASE_URL: z.string().trim().min(1),
  SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
  BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: z.enum(["true", "false"]).optional(),
});

export function readRuntimePublicConfig(
  environment: Record<string, string | undefined> = process.env,
): RuntimePublicConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) throw invalidConfiguration(parsed.error.issues);

  const classifierSetting = parsed.data.BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED;
  if (parsed.data.BAZORIA_DEPLOYMENT_ENVIRONMENT !== "local" && classifierSetting === undefined) {
    throw invalidConfiguration([
      {
        path: ["BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED"],
        message: "Required",
      },
    ]);
  }

  try {
    return parseRuntimePublicConfig({
      environment: parsed.data.BAZORIA_DEPLOYMENT_ENVIRONMENT,
      supabaseUrl: parsed.data.SUPABASE_URL,
      supabasePublishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY,
      classifierAssistedUploadEnabled: classifierSetting === "true",
    });
  } catch {
    throw new RuntimePublicConfigurationError(
      "runtime_public_configuration_invalid: browser-safe configuration is invalid",
    );
  }
}

function invalidConfiguration(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): RuntimePublicConfigurationError {
  const details = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  return new RuntimePublicConfigurationError(`runtime_public_configuration_invalid: ${details}`);
}
