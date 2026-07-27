export const SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH = 8000;

export function hasValidSellerProductDescriptionLength(value: string | null | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    Array.from(value).length <= SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH
  );
}
