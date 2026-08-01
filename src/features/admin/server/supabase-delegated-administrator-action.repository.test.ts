import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseDelegatedAdministratorActionRepository } from "./supabase-delegated-administrator-action.repository";

describe("SupabaseDelegatedAdministratorActionRepository", () => {
  it("maps the protected claim result", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          operation_result: "claimed",
          seller_id: sellerId,
          target_id: groupId,
          status: "running",
          attempt_count: 2,
          attempt_token: attemptToken,
          error_code: null,
        },
      ],
      error: null,
    }));
    const repository = new SupabaseDelegatedAdministratorActionRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    await expect(
      repository.claim({
        requestId,
        workflowId,
        administratorUserId,
        actionType: "approve_group",
        targetId: groupId,
        requestFingerprint: "a".repeat(64),
        leaseTimeoutSeconds: 120,
      }),
    ).resolves.toEqual({
      operation: "claimed",
      sellerId,
      targetId: groupId,
      status: "running",
      attemptCount: 2,
      attemptToken,
      errorCode: null,
    });
    expect(rpc).toHaveBeenCalledWith("claim_delegated_administrator_action", {
      p_request_id: requestId,
      p_workflow_id: workflowId,
      p_administrator_user_id: administratorUserId,
      p_action_type: "approve_group",
      p_target_id: groupId,
      p_request_fingerprint: "a".repeat(64),
      p_lease_timeout_seconds: 120,
    });
  });

  it("uses token-fenced protected finalization functions", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const repository = new SupabaseDelegatedAdministratorActionRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    await expect(repository.finalizeSuccess(requestId, attemptToken)).resolves.toBe(true);
    await expect(
      repository.finalizeFailure(requestId, attemptToken, "delegated_review_not_allowed"),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(1, "finalize_delegated_administrator_action_success", {
      p_request_id: requestId,
      p_attempt_token: attemptToken,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "finalize_delegated_administrator_action_failure", {
      p_request_id: requestId,
      p_attempt_token: attemptToken,
      p_error_code: "delegated_review_not_allowed",
    });
  });
});

const requestId = uuid(1);
const workflowId = uuid(2);
const sellerId = uuid(3);
const administratorUserId = uuid(4);
const groupId = uuid(5);
const attemptToken = uuid(6);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
