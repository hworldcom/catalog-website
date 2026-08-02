export type SellerProductArchiveSnapshot = {
  productId: string;
  productStatus: "archived";
};

export type SellerProductArchiveErrorCode =
  "product_not_found" | "product_archive_not_allowed" | "product_archive_unavailable";

export class SellerProductArchiveError extends Error {
  constructor(
    public readonly statusCode: 404 | 409 | 503,
    public readonly code: SellerProductArchiveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SellerProductArchiveError";
  }
}
