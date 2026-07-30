import type {
  ClassifierImportGroupOutcome,
  ClassifierImportRun,
} from "@/features/admin/server/classifier-import.types";

import type { SellerClassifierProductDraftSummary } from "../seller-classifier-import.types";

export type OwnedClassifierImportBindingResult = {
  operation: "created" | "existing" | "ownership_conflict" | "stale" | "not_found";
  run: ClassifierImportRun | null;
};

export type SellerClassifierImportActionState = {
  canRetryTemporary: boolean;
};

export interface SellerClassifierImportRepository {
  findBySource(
    classifierOrganizationId: string,
    classifierBatchId: string,
  ): Promise<ClassifierImportRun | null>;
  createOrGetOwned(input: {
    workflowId: string;
    sellerId: string;
    classifierOrganizationId: string;
    classifierBatchId: string;
    requestedByUserId: string;
  }): Promise<OwnedClassifierImportBindingResult>;
  findOwned(workflowId: string, sellerId: string): Promise<ClassifierImportRun | null>;
  listGroupOutcomes(importId: string): Promise<ClassifierImportGroupOutcome[]>;
  getActionState(importId: string): Promise<SellerClassifierImportActionState>;
  listProductDrafts(
    importId: string,
    sellerId: string,
  ): Promise<SellerClassifierProductDraftSummary[]>;
  retry(importId: string): Promise<"requeued" | "noop" | "not_found" | "not_allowed">;
}
