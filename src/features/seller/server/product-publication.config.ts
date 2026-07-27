import { z } from "zod";

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

const schema = z
  .object({
    BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: z.literal("local"),
    BAZORIA_PRODUCT_PUBLICATION_MAXIMUM_IMAGE_COUNT: positiveInteger.default(20),
    BAZORIA_PRODUCT_PUBLICATION_ITEM_CONCURRENCY: positiveInteger.default(3),
    BAZORIA_PRODUCT_PUBLICATION_ITEM_TIMEOUT_SECONDS: positiveInteger.default(30),
    BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS: positiveInteger.default(240),
    BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS: positiveInteger.default(360),
    NODE_ENV: z.string().optional().default("development"),
    SUPABASE_URL: absoluteHttpUrl,
    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  })
  .superRefine((settings, context) => {
    if (settings.NODE_ENV === "production") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE"],
        message: "local dispatch is not allowed in production",
      });
    }

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

export type ProductPublicationConfig = {
  dispatchMode: "local";
  maximumImageCount: number;
  itemConcurrency: number;
  itemTimeoutMs: number;
  workerDeadlineMs: number;
  claimTimeoutSeconds: number;
  supabaseUrl: string;
  serviceRoleKey: string;
};

export function readProductPublicationConfig(
  environment: Record<string, string | undefined> = process.env,
): ProductPublicationConfig {
  const result = schema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`product_publication_configuration_invalid: ${details}`);
  }

  return {
    dispatchMode: result.data.BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE,
    maximumImageCount: result.data.BAZORIA_PRODUCT_PUBLICATION_MAXIMUM_IMAGE_COUNT,
    itemConcurrency: result.data.BAZORIA_PRODUCT_PUBLICATION_ITEM_CONCURRENCY,
    itemTimeoutMs: result.data.BAZORIA_PRODUCT_PUBLICATION_ITEM_TIMEOUT_SECONDS * 1000,
    workerDeadlineMs: result.data.BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS * 1000,
    claimTimeoutSeconds: result.data.BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS,
    supabaseUrl: result.data.SUPABASE_URL,
    serviceRoleKey: result.data.SUPABASE_SERVICE_ROLE_KEY,
  };
}
