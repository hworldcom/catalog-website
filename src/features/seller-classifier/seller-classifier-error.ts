export function isSellerClassifierUnavailable(error: unknown): boolean {
  return sellerClassifierErrorCode(error) === "seller_classifier_unavailable";
}

export function sellerClassifierErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}
