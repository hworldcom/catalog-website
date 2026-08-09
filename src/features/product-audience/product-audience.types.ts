import { z } from "zod";

export const PRODUCT_AUDIENCES = ["women", "men", "kids"] as const;

export const productAudienceSchema = z.enum(PRODUCT_AUDIENCES);

export const productAudienceSetSchema = z
  .array(productAudienceSchema)
  .transform((values) => PRODUCT_AUDIENCES.filter((audience) => values.includes(audience)));

export type ProductAudience = z.infer<typeof productAudienceSchema>;

export type ProductAudienceErrorCode =
  | "product_audience_invalid"
  | "product_audience_product_not_found"
  | "product_audience_moderation_required"
  | "product_audience_unavailable";

export class ProductAudienceError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409 | 503,
    public readonly code: ProductAudienceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductAudienceError";
  }
}

export function parseStoredProductAudiences(values: string[]): ProductAudience[] {
  return productAudienceSetSchema.parse(values);
}

export function hasProductAudienceValidationIssue(error: z.ZodError): boolean {
  return error.issues.some((issue) => issue.path[0] === "audiences");
}

export function productAudienceInvalid(): ProductAudienceError {
  return new ProductAudienceError(
    400,
    "product_audience_invalid",
    "The selected product audience is invalid.",
  );
}

export function productAudienceUnavailable(): ProductAudienceError {
  return new ProductAudienceError(
    503,
    "product_audience_unavailable",
    "Product audiences are temporarily unavailable.",
  );
}
