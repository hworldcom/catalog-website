import { createHash } from "node:crypto";

import {
  delegatedActionAuditUnavailable,
  delegatedActionInProgress,
  delegatedActionRequestConflict,
  delegatedTerminalError,
  DelegatedClassifierContinuationError,
} from "../delegated-classifier-review-import.types";
import { delegatedUploadWorkflowNotFound } from "../delegated-classifier-upload.types";
import type { DelegatedAdministratorActionConfig } from "./delegated-administrator-action.config";
import {
  DelegatedAdministratorActionRepositoryError,
  type DelegatedAdministratorActionRepository,
  type DelegatedAdministratorActionType,
} from "./delegated-administrator-action.repository";

const FINGERPRINT_CONTRACT_VERSION = 1;

export type DelegatedActionPayload =
  | null
  | boolean
  | number
  | string
  | DelegatedActionPayload[]
  | { [key: string]: DelegatedActionPayload };

export class DelegatedAdministratorActionService {
  constructor(
    private readonly repository: DelegatedAdministratorActionRepository,
    private readonly config: DelegatedAdministratorActionConfig,
  ) {}

  async run<TResult>(input: {
    requestId: string;
    workflowId: string;
    expectedSellerId: string;
    administratorUserId: string;
    actionType: DelegatedAdministratorActionType;
    targetId: string | null;
    payload: DelegatedActionPayload;
    readTerminal: () => Promise<TResult>;
    reconcile: () => Promise<TResult | null>;
    execute: () => Promise<TResult>;
    restoreTerminalError?: (errorCode: string | null) => Error;
    terminalErrorCode?: (error: unknown) => string | null;
  }): Promise<TResult> {
    const requestFingerprint = createDelegatedActionFingerprint({
      actionType: input.actionType,
      targetId: input.targetId,
      payload: input.payload,
    });
    const claim = await this.auditOperation(() =>
      this.repository.claim({
        requestId: input.requestId,
        workflowId: input.workflowId,
        administratorUserId: input.administratorUserId,
        actionType: input.actionType,
        targetId: input.targetId,
        requestFingerprint,
        leaseTimeoutSeconds: this.config.leaseTimeoutSeconds,
      }),
    );

    if (claim.operation === "workflow_not_found") throw delegatedUploadWorkflowNotFound();
    if (claim.operation === "request_conflict") throw delegatedActionRequestConflict();
    if (claim.operation === "in_progress") throw delegatedActionInProgress();
    if (claim.operation === "failed") {
      throw (input.restoreTerminalError ?? delegatedTerminalError)(claim.errorCode);
    }
    if (claim.operation === "succeeded") return input.readTerminal();

    if (
      !claim.attemptToken ||
      claim.sellerId !== input.expectedSellerId ||
      claim.targetId !== input.targetId
    ) {
      throw delegatedActionAuditUnavailable();
    }

    try {
      const result = await withTimeout(
        reconcileOrExecute(input.reconcile, input.execute),
        this.config.actionTimeoutMs,
      );
      const finalized = await this.auditOperation(() =>
        this.repository.finalizeSuccess(input.requestId, claim.attemptToken!),
      );
      if (!finalized) throw delegatedActionInProgress();
      return result;
    } catch (error) {
      if (error instanceof DelegatedActionTimeoutError) {
        throw delegatedActionInProgress();
      }
      const terminalErrorCode = (input.terminalErrorCode ?? classifierTerminalErrorCode)(error);
      if (!terminalErrorCode) throw error;

      const finalized = await this.auditOperation(() =>
        this.repository.finalizeFailure(input.requestId, claim.attemptToken!, terminalErrorCode),
      );
      if (!finalized) throw delegatedActionInProgress();
      throw error;
    }
  }

  private async auditOperation<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DelegatedAdministratorActionRepositoryError) {
        throw delegatedActionAuditUnavailable();
      }
      throw error;
    }
  }
}

export function createDelegatedActionFingerprint(input: {
  actionType: DelegatedAdministratorActionType;
  targetId: string | null;
  payload: DelegatedActionPayload;
}): string {
  const canonical = canonicalJson({
    actionType: input.actionType,
    contractVersion: FINGERPRINT_CONTRACT_VERSION,
    payload: input.payload,
    targetId: input.targetId?.toLowerCase() ?? null,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function canonicalJson(value: DelegatedActionPayload): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw delegatedActionAuditUnavailable();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(",")}}`;
}

function classifierTerminalErrorCode(error: unknown): string | null {
  if (!(error instanceof DelegatedClassifierContinuationError)) return null;
  return error.code === "delegated_review_invalid" ||
    error.code === "delegated_review_resource_not_found" ||
    error.code === "delegated_review_not_allowed" ||
    error.code === "delegated_import_retry_not_allowed"
    ? error.code
    : null;
}

async function reconcileOrExecute<TResult>(
  reconcile: () => Promise<TResult | null>,
  execute: () => Promise<TResult>,
): Promise<TResult> {
  return (await reconcile()) ?? execute();
}

function withTimeout<TResult>(operation: Promise<TResult>, timeoutMs: number): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DelegatedActionTimeoutError()), timeoutMs);
    timer.unref?.();
    operation.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class DelegatedActionTimeoutError extends Error {
  constructor() {
    super("Delegated administrator action timed out.");
    this.name = "DelegatedActionTimeoutError";
  }
}
