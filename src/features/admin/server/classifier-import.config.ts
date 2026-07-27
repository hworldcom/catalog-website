import { z } from "zod";

const positiveNumber = z.coerce.number().finite().positive();
const positiveInteger = z.coerce.number().int().positive();
const uuid = z.string().trim().uuid();
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

const classifierImportConfigSchema = z
  .object({
    BAZORIA_CLASSIFIER_API_BASE_URL: absoluteHttpUrl,
    BAZORIA_CLASSIFIER_APPROVED_GROUPS_TIMEOUT_SECONDS: positiveNumber.default(30),
    BAZORIA_CLASSIFIER_IMPORT_RUN_LEASE_TIMEOUT_SECONDS: positiveInteger.default(900),
    BAZORIA_CLASSIFIER_IMAGE_READ_TIMEOUT_SECONDS: positiveNumber.default(30),
    BAZORIA_IMAGE_STORAGE_HEAD_TIMEOUT_SECONDS: positiveNumber.default(15),
    BAZORIA_IMAGE_STORAGE_WRITE_TIMEOUT_SECONDS: positiveNumber.default(60),
    BAZORIA_IMAGE_PROMOTION_CLAIM_TIMEOUT_SECONDS: positiveInteger.default(300),
    BAZORIA_CLASSIFIER_IMPORT_WORKER_POLL_INTERVAL_SECONDS: positiveNumber.default(5),
    BAZORIA_CLASSIFIER_IMPORT_DISPATCH_MODE: z.literal("local"),
    BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID: uuid,
    SUPABASE_URL: absoluteHttpUrl,
    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  })
  .superRefine((settings, context) => {
    const minimumClaimTimeout =
      settings.BAZORIA_CLASSIFIER_IMAGE_READ_TIMEOUT_SECONDS +
      settings.BAZORIA_IMAGE_STORAGE_HEAD_TIMEOUT_SECONDS +
      settings.BAZORIA_IMAGE_STORAGE_WRITE_TIMEOUT_SECONDS +
      120;
    if (settings.BAZORIA_IMAGE_PROMOTION_CLAIM_TIMEOUT_SECONDS < minimumClaimTimeout) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BAZORIA_IMAGE_PROMOTION_CLAIM_TIMEOUT_SECONDS"],
        message: `must be at least ${minimumClaimTimeout} seconds for the configured operation timeouts`,
      });
    }
  });

export type ClassifierImportConfig = {
  classifierApiBaseUrl: string;
  approvedGroupsTimeoutMs: number;
  importRunLeaseTimeoutSeconds: number;
  normalizedImageReadTimeoutMs: number;
  storageHeadTimeoutMs: number;
  storageWriteTimeoutMs: number;
  imagePromotionClaimTimeoutSeconds: number;
  workerPollIntervalMs: number;
  dispatchMode: "local";
  classifierOrganizationId: string;
};

export function readClassifierImportConfig(
  environment: Record<string, string | undefined> = process.env,
): ClassifierImportConfig {
  const result = classifierImportConfigSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid classifier import configuration: ${details}`);
  }

  return {
    classifierApiBaseUrl: result.data.BAZORIA_CLASSIFIER_API_BASE_URL,
    approvedGroupsTimeoutMs: result.data.BAZORIA_CLASSIFIER_APPROVED_GROUPS_TIMEOUT_SECONDS * 1000,
    importRunLeaseTimeoutSeconds: result.data.BAZORIA_CLASSIFIER_IMPORT_RUN_LEASE_TIMEOUT_SECONDS,
    normalizedImageReadTimeoutMs: result.data.BAZORIA_CLASSIFIER_IMAGE_READ_TIMEOUT_SECONDS * 1000,
    storageHeadTimeoutMs: result.data.BAZORIA_IMAGE_STORAGE_HEAD_TIMEOUT_SECONDS * 1000,
    storageWriteTimeoutMs: result.data.BAZORIA_IMAGE_STORAGE_WRITE_TIMEOUT_SECONDS * 1000,
    imagePromotionClaimTimeoutSeconds: result.data.BAZORIA_IMAGE_PROMOTION_CLAIM_TIMEOUT_SECONDS,
    workerPollIntervalMs: result.data.BAZORIA_CLASSIFIER_IMPORT_WORKER_POLL_INTERVAL_SECONDS * 1000,
    dispatchMode: result.data.BAZORIA_CLASSIFIER_IMPORT_DISPATCH_MODE,
    classifierOrganizationId: result.data.BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID,
  };
}

export function readDefaultClassifierSellerId(
  environment: Record<string, string | undefined> = process.env,
): string {
  const result = uuid.safeParse(environment.BAZORIA_DEFAULT_SELLER_ID);
  if (!result.success) {
    throw new Error(
      `Invalid classifier import configuration: BAZORIA_DEFAULT_SELLER_ID: ${result.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  return result.data;
}
