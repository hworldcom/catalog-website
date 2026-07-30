import type { DelegatedUploadSeller } from "../delegated-classifier-upload.types";
import type { SellerClassifierBatchRecord } from "@/features/seller-classifier/server/seller-classifier-batch.repository";

export interface DelegatedClassifierUploadRepository {
  searchSellers(input: { query: string; limit: number }): Promise<DelegatedUploadSeller[]>;
  findSeller(sellerId: string): Promise<DelegatedUploadSeller | null>;
  findWorkflow(workflowId: string): Promise<SellerClassifierBatchRecord | null>;
}

export class DelegatedClassifierUploadRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegatedClassifierUploadRepositoryError";
  }
}
