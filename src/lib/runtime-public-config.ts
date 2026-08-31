import { z } from "zod";

const deploymentEnvironmentSchema = z.enum(["local", "uat", "production"]);
const runtimePublicConfigSchema = z
  .object({
    environment: deploymentEnvironmentSchema,
    supabaseUrl: z
      .string()
      .trim()
      .url()
      .transform((value, context) => {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "must use http or https",
          });
          return z.NEVER;
        }
        return url.toString().replace(/\/+$/, "");
      }),
    supabasePublishableKey: z
      .string()
      .trim()
      .min(1)
      .refine((value) => !isSupabaseSecret(value), "must be a browser-safe Supabase key"),
    classifierAssistedUploadEnabled: z.boolean(),
  })
  .strict();

export type DeploymentEnvironment = z.infer<typeof deploymentEnvironmentSchema>;
export type RuntimePublicConfig = z.infer<typeof runtimePublicConfigSchema>;

export class RuntimePublicConfigurationError extends Error {
  readonly code = "runtime_public_configuration_unavailable";

  constructor(message = "Bazoria runtime configuration is unavailable.") {
    super(message);
    this.name = "RuntimePublicConfigurationError";
  }
}

let initializedConfig: RuntimePublicConfig | undefined;
let initializationPromise: Promise<RuntimePublicConfig> | undefined;

export function parseRuntimePublicConfig(value: unknown): RuntimePublicConfig {
  const parsed = runtimePublicConfigSchema.safeParse(value);
  if (!parsed.success) throw new RuntimePublicConfigurationError();
  return parsed.data;
}

export function initializeRuntimePublicConfig(
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<RuntimePublicConfig> {
  if (initializedConfig) return Promise.resolve(initializedConfig);
  initializationPromise ??= fetchRuntimePublicConfig(fetchImplementation).then((config) => {
    initializedConfig = config;
    return config;
  });
  return initializationPromise;
}

export function getInitializedRuntimePublicConfig(): RuntimePublicConfig {
  if (!initializedConfig) throw new RuntimePublicConfigurationError();
  return initializedConfig;
}

export function getOptionalInitializedRuntimePublicConfig(): RuntimePublicConfig | null {
  return initializedConfig ?? null;
}

export function resetRuntimePublicConfigForTests(): void {
  initializedConfig = undefined;
  initializationPromise = undefined;
}

function isSupabaseSecret(value: string): boolean {
  if (value.startsWith("sb_secret_")) return true;

  const parts = value.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const normalized = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const json =
      typeof globalThis.atob === "function"
        ? globalThis.atob(`${normalized}${padding}`)
        : Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
    const payload = JSON.parse(json) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

async function fetchRuntimePublicConfig(
  fetchImplementation: typeof fetch,
): Promise<RuntimePublicConfig> {
  let response: Response;
  try {
    response = await fetchImplementation("/api/runtime-config", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new RuntimePublicConfigurationError();
  }

  if (!response.ok) throw new RuntimePublicConfigurationError();
  try {
    return parseRuntimePublicConfig(await response.json());
  } catch {
    throw new RuntimePublicConfigurationError();
  }
}
