import { z } from "zod";

import type { ProductActivationExecutionConfig } from "./product-activation.worker";

const positiveInteger = z.coerce.number().int().positive();
const absoluteHttpUrl = z
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
  });
const secureUrl = z
  .string()
  .trim()
  .url()
  .transform((value, context) => {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "must use https" });
      return z.NEVER;
    }
    return url.toString();
  });

const schema = z
  .object({
    BAZORIA_DEPLOYMENT_ENVIRONMENT: z.enum(["local", "uat", "production"]),
    BAZORIA_PRODUCT_PUBLICATION_MAXIMUM_IMAGE_COUNT: positiveInteger.default(20),
    BAZORIA_PRODUCT_PUBLICATION_ITEM_CONCURRENCY: positiveInteger.default(3),
    BAZORIA_PRODUCT_PUBLICATION_ITEM_TIMEOUT_SECONDS: positiveInteger.default(30),
    BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS: positiveInteger.default(240),
    BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS: positiveInteger.default(360),
    SUPABASE_URL: absoluteHttpUrl,
    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
    BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: secureUrl,
    BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT: z.string().trim().email(),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8_080),
  })
  .superRefine((settings, context) => {
    const boundedWorkSeconds =
      Math.ceil(
        settings.BAZORIA_PRODUCT_PUBLICATION_MAXIMUM_IMAGE_COUNT /
          settings.BAZORIA_PRODUCT_PUBLICATION_ITEM_CONCURRENCY,
      ) *
        settings.BAZORIA_PRODUCT_PUBLICATION_ITEM_TIMEOUT_SECONDS +
      30;
    if (boundedWorkSeconds > settings.BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS"],
        message: `must be at least ${boundedWorkSeconds} seconds for the configured bounded work`,
      });
    }

    const minimumClaimSeconds = settings.BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS + 60;
    if (minimumClaimSeconds > settings.BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS"],
        message: `must be at least ${minimumClaimSeconds} seconds for the configured worker deadline`,
      });
    }
  });

export type ProductActivationWorkerConfig = ProductActivationExecutionConfig & {
  deploymentEnvironment: "local" | "uat" | "production";
  supabaseUrl: string;
  serviceRoleKey: string;
  taskAudience: string;
  taskServiceAccount: string;
  port: number;
};

export function readProductActivationWorkerConfig(
  environment: Record<string, string | undefined> = process.env,
): ProductActivationWorkerConfig {
  const result = schema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`product_publication_configuration_invalid: ${details}`);
  }

  return {
    deploymentEnvironment: result.data.BAZORIA_DEPLOYMENT_ENVIRONMENT,
    maximumImageCount: result.data.BAZORIA_PRODUCT_PUBLICATION_MAXIMUM_IMAGE_COUNT,
    itemConcurrency: result.data.BAZORIA_PRODUCT_PUBLICATION_ITEM_CONCURRENCY,
    itemTimeoutMs: result.data.BAZORIA_PRODUCT_PUBLICATION_ITEM_TIMEOUT_SECONDS * 1_000,
    workerDeadlineMs: result.data.BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS * 1_000,
    claimTimeoutSeconds: result.data.BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS,
    supabaseUrl: result.data.SUPABASE_URL,
    serviceRoleKey: result.data.SUPABASE_SERVICE_ROLE_KEY,
    taskAudience: result.data.BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE,
    taskServiceAccount: result.data.BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT,
    port: result.data.PORT,
  };
}
