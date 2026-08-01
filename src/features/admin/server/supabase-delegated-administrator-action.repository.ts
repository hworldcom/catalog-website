import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import {
  DelegatedAdministratorActionRepositoryError,
  type DelegatedAdministratorActionClaimResult,
  type DelegatedAdministratorActionRepository,
  type DelegatedAdministratorActionType,
} from "./delegated-administrator-action.repository";

type DatabaseClient = SupabaseClient<Database>;
type ClaimRow =
  Database["public"]["Functions"]["claim_delegated_administrator_action"]["Returns"][number];

export class SupabaseDelegatedAdministratorActionRepository implements DelegatedAdministratorActionRepository {
  constructor(private readonly database: DatabaseClient) {}

  async claim(input: {
    requestId: string;
    workflowId: string;
    administratorUserId: string;
    actionType: DelegatedAdministratorActionType;
    targetId: string | null;
    requestFingerprint: string;
    leaseTimeoutSeconds: number;
  }): Promise<DelegatedAdministratorActionClaimResult> {
    const response = await this.database.rpc("claim_delegated_administrator_action", {
      p_request_id: input.requestId,
      p_workflow_id: input.workflowId,
      p_administrator_user_id: input.administratorUserId,
      p_action_type: input.actionType,
      p_target_id: input.targetId,
      p_request_fingerprint: input.requestFingerprint,
      p_lease_timeout_seconds: input.leaseTimeoutSeconds,
    });
    if (response.error) throw databaseError(response.error);
    return mapClaim(requireClaimRow(response.data?.[0]));
  }

  async finalizeSuccess(requestId: string, attemptToken: string): Promise<boolean> {
    const response = await this.database.rpc("finalize_delegated_administrator_action_success", {
      p_request_id: requestId,
      p_attempt_token: attemptToken,
    });
    if (response.error) throw databaseError(response.error);
    return requireBoolean(response.data);
  }

  async finalizeFailure(
    requestId: string,
    attemptToken: string,
    errorCode: string,
  ): Promise<boolean> {
    const response = await this.database.rpc("finalize_delegated_administrator_action_failure", {
      p_request_id: requestId,
      p_attempt_token: attemptToken,
      p_error_code: errorCode,
    });
    if (response.error) throw databaseError(response.error);
    return requireBoolean(response.data);
  }

  async findImportRunId(workflowId: string, sellerId: string): Promise<string | null> {
    const response = await this.database
      .from("classifier_import_runs")
      .select("id")
      .eq("seller_classifier_workflow_id", workflowId)
      .eq("seller_id", sellerId)
      .maybeSingle();
    if (response.error) throw databaseError(response.error);
    return response.data?.id ?? null;
  }
}

function mapClaim(row: ClaimRow): DelegatedAdministratorActionClaimResult {
  return {
    operation: parseValue(row.operation_result, [
      "claimed",
      "in_progress",
      "succeeded",
      "failed",
      "request_conflict",
      "workflow_not_found",
    ]),
    sellerId: row.seller_id,
    targetId: row.target_id,
    status: row.status ? parseValue(row.status, ["running", "succeeded", "failed"]) : null,
    attemptCount: row.attempt_count,
    attemptToken: row.attempt_token,
    errorCode: row.error_code,
  };
}

function requireClaimRow(row: ClaimRow | undefined): ClaimRow {
  if (!row) {
    throw new DelegatedAdministratorActionRepositoryError(
      "Delegated administrator action claim returned no result.",
    );
  }
  return row;
}

function requireBoolean(value: boolean | null): boolean {
  if (typeof value !== "boolean") {
    throw new DelegatedAdministratorActionRepositoryError(
      "Delegated administrator action finalization returned an invalid result.",
    );
  }
  return value;
}

function parseValue<const T extends string>(value: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new DelegatedAdministratorActionRepositoryError(
    "Delegated administrator action returned an unexpected durable value.",
  );
}

function databaseError(error: { message: string }): DelegatedAdministratorActionRepositoryError {
  console.error("[Delegated administrator action] Database operation failed.", {
    message: error.message,
  });
  return new DelegatedAdministratorActionRepositoryError(
    "Delegated administrator action database operation failed.",
  );
}
