import type {
  SellerClassifierBatchProvisioningStatus,
  SellerClassifierBatchStage,
} from "../seller-classifier-batch.types";

export type SellerClassifierBatchRecord = {
  id: string;
  sellerId: string;
  clientRequestId: string;
  classifierOrganizationId: string;
  classifierBatchId: string | null;
  maxFiles: number | null;
  maxFileSizeBytes: number | null;
  provisioningStatus: SellerClassifierBatchProvisioningStatus;
  lastKnownStage: SellerClassifierBatchStage;
  originalFileCount: number;
  processedFileCount: number;
  groupCount: number;
  productDraftCount: number;
  errorCode: string | null;
  retryable: boolean;
  initiatedByUserId: string;
  initiatorKind: "seller" | "administrator";
  createdAt: string;
  updatedAt: string;
};

export type SellerClassifierBatchCreateResult = {
  operation: "created" | "existing";
  record: SellerClassifierBatchRecord;
};

export type SellerClassifierBatchCompletionResult = {
  operation: "completed" | "ready" | "conflict" | "not_found" | "not_in_progress";
  record: SellerClassifierBatchRecord | null;
};

export type SellerClassifierBatchFailureResult = {
  operation: "failed" | "ready" | "not_found";
  record: SellerClassifierBatchRecord | null;
};

export type SellerClassifierBatchRetryClaimResult = {
  operation: "claimed" | "ready" | "in_progress" | "not_retryable" | "not_found";
  record: SellerClassifierBatchRecord | null;
};

export type SellerClassifierBatchObservationKind = "upload" | "processing" | "processing_retry";

export type SellerClassifierBatchObservationResult = {
  operation: "recorded" | "stale" | "not_found" | "not_ready";
  record: SellerClassifierBatchRecord | null;
};

export type SellerClassifierReviewObservationResult = {
  operation: "recorded" | "stale" | "not_found" | "not_ready";
  record: SellerClassifierBatchRecord | null;
};

export type SellerClassifierApprovalResult = {
  operation: "recorded" | "stale" | "not_found" | "not_ready";
  record: SellerClassifierBatchRecord | null;
};

export interface SellerClassifierBatchRepository {
  createOrGet(input: {
    sellerId: string;
    clientRequestId: string;
    classifierOrganizationId: string;
    initiatedByUserId: string;
    initiatorKind: "seller" | "administrator";
  }): Promise<SellerClassifierBatchCreateResult>;
  findOwned(workflowId: string, sellerId: string): Promise<SellerClassifierBatchRecord | null>;
  completeProvisioning(input: {
    workflowId: string;
    classifierBatchId: string;
    maxFiles: number;
    maxFileSizeBytes: number;
  }): Promise<SellerClassifierBatchCompletionResult>;
  failProvisioning(input: {
    workflowId: string;
    errorCode: string;
    retryable: boolean;
  }): Promise<SellerClassifierBatchFailureResult>;
  claimRetry(workflowId: string, sellerId: string): Promise<SellerClassifierBatchRetryClaimResult>;
  recordObservation(input: {
    workflowId: string;
    sellerId: string;
    observationKind: SellerClassifierBatchObservationKind;
    stage: "upload" | "processing" | "review" | "approved" | "failed";
    originalFileCount: number;
    processedFileCount: number;
    errorCode: string | null;
    retryable: boolean;
  }): Promise<SellerClassifierBatchObservationResult>;
  recordReviewObservation(input: {
    workflowId: string;
    sellerId: string;
    stage: "review" | "approved";
    groupCount: number;
  }): Promise<SellerClassifierReviewObservationResult>;
  recordApproved(input: {
    workflowId: string;
    sellerId: string;
    groupCount: number;
  }): Promise<SellerClassifierApprovalResult>;
}
