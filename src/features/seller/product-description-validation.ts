import { PRODUCT_DRAFT_DESCRIPTION_MAX_LENGTH } from "@/features/product-draft-descriptions/product-draft-descriptions.types";

export const SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH = PRODUCT_DRAFT_DESCRIPTION_MAX_LENGTH;

export function hasValidSellerProductDescriptionLength(value: string | null | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    Array.from(value).length <= SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH
  );
}
