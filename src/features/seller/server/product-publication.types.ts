export type ProductPublicationStatus =
  "pending" | "running" | "failed" | "cleanup_required" | "completed";

export type ProductPublicationItemStatus =
  "pending" | "copying" | "verified" | "failed" | "cleanup_required" | "completed";

export type ProductPublicationErrorCode =
  | "product_publication_dispatch_failed"
  | "product_publication_source_unavailable"
  | "product_publication_source_changed"
  | "product_publication_destination_conflict"
  | "product_publication_transfer_failed"
  | "product_publication_verification_failed"
  | "product_publication_cleanup_required"
  | "product_publication_finalization_failed";

export type ProductPublicationRun = {
  productDraftId: string;
  sellerId: string;
  status: ProductPublicationStatus;
  attemptCount: number;
  attemptToken: string | null;
  claimStartedAt: string | null;
  errorCode: string | null;
  completedAt: string | null;
};

export type ProductPublicationItem = {
  productDraftId: string;
  productDraftImageId: string;
  sourceBucket: "product-draft-images";
  sourceObjectKey: string;
  destinationKey: string;
  sourcePosition: number;
  publicationOrder: number;
  isCover: boolean;
  expectedSourceSizeBytes: number;
  expectedContentType: "image/jpeg";
  sourceSha256: string | null;
  status: ProductPublicationItemStatus;
  attemptToken: string | null;
  publicSizeBytes: number | null;
  publicSha256: string | null;
  publicEtag: string | null;
  publicUrl: string | null;
  objectCreatedByAttemptToken: string | null;
  errorCode: string | null;
};

export type ProductPublicationWorkerResult =
  | { status: "idle" }
  | {
      status: "completed" | "failed" | "cleanup_required" | "claim_lost" | "already_terminal";
      productDraftId: string;
      attemptCount?: number;
      errorCode?: ProductPublicationErrorCode;
    };

export class ProductPublicationError extends Error {
  constructor(
    public readonly code: ProductPublicationErrorCode,
    public readonly retryable: boolean,
    message = code,
    public readonly productDraftImageId?: string,
  ) {
    super(message);
    this.name = "ProductPublicationError";
  }
}

export class ProductPublicationClaimLostError extends Error {
  constructor() {
    super("The product publication attempt no longer owns its claim.");
    this.name = "ProductPublicationClaimLostError";
  }
}

export function productPublicationRetryAllowed(errorCode: string | null): boolean {
  return (
    errorCode === "product_publication_dispatch_failed" ||
    errorCode === "product_publication_source_unavailable" ||
    errorCode === "product_publication_transfer_failed" ||
    errorCode === "product_publication_verification_failed" ||
    errorCode === "product_publication_finalization_failed"
  );
}
