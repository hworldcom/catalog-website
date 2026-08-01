import type {
  SellerClassifierBatchProvisioningStatus,
  SellerClassifierBatchStage,
} from "../seller-classifier-batch.types";
import type { SellerClassifierHistoryCursor } from "../seller-classifier-history.cursor";

export type SellerClassifierHistoryImportRecord = {
  id: string;
  status: "pending" | "running" | "completed" | "completed_with_errors" | "failed";
  errorCode: string | null;
  retryable: boolean;
};

export type SellerClassifierHistoryRecord = {
  id: string;
  initiatorKind: "seller" | "administrator";
  provisioningStatus: SellerClassifierBatchProvisioningStatus;
  stage: SellerClassifierBatchStage;
  originalFileCount: number;
  processedFileCount: number;
  groupCount: number;
  productDraftCount: number;
  errorCode: string | null;
  retryable: boolean;
  createdAt: string;
  updatedAt: string;
  import: SellerClassifierHistoryImportRecord | null;
};

export interface SellerClassifierHistoryRepository {
  listOwned(input: {
    sellerId: string;
    limit: number;
    before: SellerClassifierHistoryCursor | null;
  }): Promise<SellerClassifierHistoryRecord[]>;
}

export class SellerClassifierHistoryRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SellerClassifierHistoryRepositoryError";
  }
}
