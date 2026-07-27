import type {
  LegacyProductDraftImageCutoverErrorCode,
  LegacyProductDraftImageReconciliationWorkItem,
  ProductDraftImageCutoverScanPhase,
  ProductDraftImageCutoverSummary,
  ProductDraftImagePublicObjectState,
  ProductDraftImageStorageCutover,
} from "./legacy-product-draft-image-cutover.types";

export interface LegacyProductDraftImageCutoverRepository {
  claimCutover(input: {
    version: string;
    claimTimeoutSeconds: number;
  }): Promise<ProductDraftImageStorageCutover | null>;
  heartbeat(version: string, attemptToken: string): Promise<boolean>;
  getSummary(version: string): Promise<ProductDraftImageCutoverSummary>;
  claimNextReconciliation(input: {
    version: string;
    cutoverAttemptToken: string;
    claimTimeoutSeconds: number;
  }): Promise<LegacyProductDraftImageReconciliationWorkItem | null>;
  verifyReconciliationClaim(input: {
    version: string;
    cutoverAttemptToken: string;
    destinationKey: string;
    reconciliationAttemptToken: string;
  }): Promise<boolean>;
  finalizeReconciliation(input: {
    version: string;
    cutoverAttemptToken: string;
    destinationKey: string;
    reconciliationAttemptToken: string;
    status: "completed" | "failed";
    publicObjectState: ProductDraftImagePublicObjectState;
    errorCode: LegacyProductDraftImageCutoverErrorCode | null;
    retryable: boolean;
    releaseBlocking: boolean;
    setPrivateBucket: boolean;
  }): Promise<boolean>;
  listPublicObjectKeys(cursor: string | null, limit: number): Promise<string[]>;
  recordScanObject(input: {
    version: string;
    cutoverAttemptToken: string;
    destinationKey: string;
  }): Promise<LegacyProductDraftImageCutoverErrorCode | "claim_lost">;
  setScanProgress(input: {
    version: string;
    attemptToken: string;
    scanPhase: ProductDraftImageCutoverScanPhase;
    expectedCursor: string | null;
    nextCursor: string | null;
  }): Promise<boolean>;
  beginScanPhase(input: {
    version: string;
    attemptToken: string;
    expectedPhase: ProductDraftImageCutoverScanPhase;
    nextPhase: ProductDraftImageCutoverScanPhase;
  }): Promise<boolean>;
  failCutover(
    version: string,
    attemptToken: string,
    errorCode: LegacyProductDraftImageCutoverErrorCode,
  ): Promise<boolean>;
  completeCutover(version: string, attemptToken: string): Promise<boolean>;
}
