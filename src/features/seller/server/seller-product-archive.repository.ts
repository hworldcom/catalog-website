export type SellerProductArchiveOperationInput = {
  productId: string;
  sellerId: string;
  actorUserId: string;
  expectedModerationRevision: number;
  requestId: string;
};

export type SellerProductArchiveRepositoryResult =
  | {
      result: "archived";
      productId: string;
      productStatus: "archived";
      moderationRevision: number;
      restorationDraft: false;
    }
  | {
      result: "restoration_draft";
      productId: string;
      productStatus: "archived";
      moderationRevision: number;
      restorationDraft: true;
    }
  | {
      result:
        | "product_not_found"
        | "product_archive_moderation_active"
        | "product_restore_moderation_active"
        | "product_moderation_revision_conflict"
        | "product_archive_not_allowed"
        | "product_restore_not_allowed"
        | "product_archive_request_conflict"
        | "product_restore_request_conflict";
    };

export interface SellerProductArchiveRepository {
  archive(input: SellerProductArchiveOperationInput): Promise<SellerProductArchiveRepositoryResult>;
  restore(input: SellerProductArchiveOperationInput): Promise<SellerProductArchiveRepositoryResult>;
}

export class SellerProductArchiveRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SellerProductArchiveRepositoryError";
  }
}
