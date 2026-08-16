export type SellerProductArchiveSnapshot = {
  productId: string;
  productStatus: "archived";
  moderationRevision: number;
};

export type SellerProductRestoreSnapshot = SellerProductArchiveSnapshot & {
  restorationDraft: true;
  editRoute: `/seller/products/${string}`;
};

export type SellerProductArchiveErrorCode =
  | "product_not_found"
  | "product_archive_moderation_active"
  | "product_restore_moderation_active"
  | "product_moderation_revision_conflict"
  | "product_archive_not_allowed"
  | "product_restore_not_allowed"
  | "product_archive_request_conflict"
  | "product_restore_request_conflict"
  | "product_moderation_activation_unavailable";

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
