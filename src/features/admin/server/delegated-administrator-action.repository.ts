export type DelegatedAdministratorActionType =
  | "approve_group"
  | "approve_and_create_drafts"
  | "retry_draft_import"
  | "publish_product_draft"
  | "retry_product_publication";

export type DelegatedAdministratorActionClaimResult = {
  operation:
    "claimed" | "in_progress" | "succeeded" | "failed" | "request_conflict" | "workflow_not_found";
  sellerId: string | null;
  targetId: string | null;
  status: "running" | "succeeded" | "failed" | null;
  attemptCount: number;
  attemptToken: string | null;
  errorCode: string | null;
};

export interface DelegatedAdministratorActionRepository {
  claim(input: {
    requestId: string;
    workflowId: string;
    administratorUserId: string;
    actionType: DelegatedAdministratorActionType;
    targetId: string | null;
    requestFingerprint: string;
    leaseTimeoutSeconds: number;
  }): Promise<DelegatedAdministratorActionClaimResult>;
  finalizeSuccess(requestId: string, attemptToken: string): Promise<boolean>;
  finalizeFailure(requestId: string, attemptToken: string, errorCode: string): Promise<boolean>;
  findImportRunId(workflowId: string, sellerId: string): Promise<string | null>;
}

export class DelegatedAdministratorActionRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegatedAdministratorActionRepositoryError";
  }
}
