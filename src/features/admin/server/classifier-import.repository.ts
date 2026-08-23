import type {
  ApprovedGroup,
  ClassifierImportGroupOutcome,
  ClassifierImportRun,
} from "./classifier-import.types";

export type PreparedImportGroup =
  | { result: "prepared"; productDraftId: string }
  | {
      result: "product_draft_source_conflict";
    }
  | { result: "claim_lost" };

export type RetryImportResult = "requeued" | "noop" | "not_found" | "not_allowed";
export type ReconcileImportResult = "requeued" | "not_found" | "not_allowed";

export interface ClassifierImportRepository {
  getRun(importId: string): Promise<ClassifierImportRun | null>;
  getSellerName(sellerId: string): Promise<string | null>;
  listGroupOutcomes(importId: string): Promise<ClassifierImportGroupOutcome[]>;
  retryImport(importId: string, includeNonRetryable: boolean): Promise<RetryImportResult>;
  reconcileImport(importId: string): Promise<ReconcileImportResult>;

  claimRun(importId: string, leaseTimeoutSeconds: number): Promise<ClassifierImportRun | null>;
  claimNextRun(leaseTimeoutSeconds: number): Promise<ClassifierImportRun | null>;
  heartbeat(importId: string, attemptToken: string): Promise<boolean>;
  setPipelineVersion(
    importId: string,
    attemptToken: string,
    pipelineVersion: string,
  ): Promise<boolean>;
  isRunSellerEligible(run: ClassifierImportRun): Promise<boolean>;
  prepareGroup(
    importId: string,
    attemptToken: string,
    group: ApprovedGroup,
    sourceGroupPosition: number,
  ): Promise<PreparedImportGroup>;
  setGroupResult(
    importId: string,
    attemptToken: string,
    groupId: string,
    result:
      | { status: "pending" | "processing" | "complete"; errorCode?: null }
      | { status: "failed"; errorCode: string; retryable: boolean },
  ): Promise<boolean>;
  finalizeRun(
    importId: string,
    attemptToken: string,
    result:
      | { status: "completed" | "completed_with_errors"; errorCode?: null }
      | { status: "failed"; errorCode: string; retryable: boolean },
  ): Promise<boolean>;
}
