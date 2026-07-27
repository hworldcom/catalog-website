import { z } from "zod";

const positiveNumber = z.coerce.number().finite().positive();
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
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  });

const configSchema = z.object({
  SUPABASE_URL: absoluteHttpUrl,
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  BAZORIA_IMAGE_STORAGE_HEAD_TIMEOUT_SECONDS: positiveNumber.default(15),
  BAZORIA_IMAGE_STORAGE_WRITE_TIMEOUT_SECONDS: positiveNumber.default(60),
});

export type LegacyProductDraftImageCutoverConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  storageHeadTimeoutMs: number;
  storageWriteTimeoutMs: number;
};

export function readLegacyProductDraftImageCutoverConfig(
  environment: Record<string, string | undefined> = process.env,
): LegacyProductDraftImageCutoverConfig {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid ProductDraft image cutover configuration: ${details}`);
  }
  return {
    supabaseUrl: result.data.SUPABASE_URL,
    serviceRoleKey: result.data.SUPABASE_SERVICE_ROLE_KEY,
    storageHeadTimeoutMs: result.data.BAZORIA_IMAGE_STORAGE_HEAD_TIMEOUT_SECONDS * 1000,
    storageWriteTimeoutMs: result.data.BAZORIA_IMAGE_STORAGE_WRITE_TIMEOUT_SECONDS * 1000,
  };
}

export function parseLegacyProductDraftImageCutoverArguments(arguments_: readonly string[]): {
  batchSize: number;
} {
  if (arguments_.length === 0) return { batchSize: 50 };
  if (
    arguments_.length !== 2 ||
    arguments_[0] !== "--batch-size" ||
    !/^\d+$/.test(arguments_[1] ?? "")
  ) {
    throw new Error("Usage: reconcile:product-draft-images -- --batch-size <1-100>");
  }
  const batchSize = Number(arguments_[1]);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("batchSize must be an integer from 1 through 100.");
  }
  return { batchSize };
}
