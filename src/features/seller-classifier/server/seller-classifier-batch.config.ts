import { z } from "zod";

const positiveNumber = z.coerce.number().finite().positive();
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

const schema = z.object({
  BAZORIA_CLASSIFIER_API_BASE_URL: absoluteHttpUrl,
  BAZORIA_CLASSIFIER_BATCH_CREATE_TIMEOUT_SECONDS: positiveNumber.default(30),
  BAZORIA_CLASSIFIER_COMMAND_TIMEOUT_SECONDS: positiveNumber.default(30),
  BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID: uuid,
});

export type SellerClassifierBatchConfig = {
  classifierApiBaseUrl: string;
  classifierBatchCreateTimeoutMs: number;
  classifierCommandTimeoutMs: number;
  classifierOrganizationId: string;
};

export function readSellerClassifierBatchConfig(
  environment: Record<string, string | undefined> = process.env,
): SellerClassifierBatchConfig {
  const result = schema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`seller_classifier_configuration_invalid: ${details}`);
  }

  return {
    classifierApiBaseUrl: result.data.BAZORIA_CLASSIFIER_API_BASE_URL,
    classifierBatchCreateTimeoutMs:
      result.data.BAZORIA_CLASSIFIER_BATCH_CREATE_TIMEOUT_SECONDS * 1000,
    classifierCommandTimeoutMs: result.data.BAZORIA_CLASSIFIER_COMMAND_TIMEOUT_SECONDS * 1000,
    classifierOrganizationId: result.data.BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID,
  };
}
