import { describe, expect, it, vi } from "vitest";

import { SupabaseProductActivationRepository } from "./product-activation.repository";

describe("SupabaseProductActivationRepository", () => {
  it("maps the protected decision operation and its activation identity", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "decided",
          submission_id: uuid(1),
          product_id: uuid(2),
          seller_id: uuid(3),
          review_status: "approved",
          revision: 4,
          activation_run_id: uuid(5),
          dispatch_generation: 1,
          dispatch_required: true,
        },
      ],
      error: null,
    }));
    const repository = new SupabaseProductActivationRepository({ rpc });

    const result = await repository.decide({
      submissionId: uuid(1),
      expectedRevision: 4,
      decision: "approve",
      reason: null,
      decisionRequestId: uuid(6),
      administratorUserId: uuid(7),
    });

    expect(rpc).toHaveBeenCalledWith("decide_product_moderation_submission", {
      p_submission_id: uuid(1),
      p_expected_revision: 4,
      p_decision: "approve",
      p_reason: null,
      p_decision_request_id: uuid(6),
      p_administrator_user_id: uuid(7),
    });
    expect(result.activationRunId).toBe(uuid(5));
    expect(result.dispatchRequired).toBe(true);
  });

  it("maps dispatch generation fencing results", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "stale",
          run_id: uuid(5),
          dispatch_generation: 2,
          dispatch_status: "pending",
          dispatch_required: false,
        },
      ],
      error: null,
    }));
    const repository = new SupabaseProductActivationRepository({ rpc });

    const result = await repository.recordDispatchResult({
      runId: uuid(5),
      dispatchGeneration: 1,
      result: "dispatched",
    });

    expect(result.result).toBe("stale");
    expect(result.dispatchGeneration).toBe(2);
  });

  it("parses the immutable claim manifest returned by the worker operation", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        result: "claimed",
        runId: uuid(5),
        submissionId: uuid(1),
        productId: uuid(2),
        sellerId: uuid(3),
        dispatchGeneration: 2,
        attemptCount: 1,
        attemptToken: uuid(8),
        snapshotHash: "a".repeat(64),
        expectedSubmissionRevision: 4,
        snapshot: { title: "QA shirt" },
        items: [
          {
            productDraftImageId: uuid(9),
            sourceBucket: "product-draft-images",
            sourceObjectKey: "drafts/source.jpg",
            destinationKey: "products/destination.jpg",
            sourcePosition: 0,
            publicationOrder: 0,
            isCover: true,
            expectedSourceSizeBytes: 10,
            expectedContentType: "image/jpeg",
            sourceSha256: null,
            publicSizeBytes: null,
            publicSha256: null,
            publicEtag: null,
            publicUrl: null,
            objectCreatedByAttemptToken: null,
          },
        ],
      },
      error: null,
    }));
    const repository = new SupabaseProductActivationRepository({ rpc });

    const result = await repository.claimRun({ runId: uuid(5), dispatchGeneration: 2 }, 360);

    expect(rpc).toHaveBeenCalledWith("claim_product_activation_run", {
      p_run_id: uuid(5),
      p_dispatch_generation: 2,
      p_claim_timeout_seconds: 360,
    });
    expect(result).toMatchObject({
      result: "claimed",
      attemptToken: uuid(8),
      items: [{ productDraftImageId: uuid(9) }],
    });
  });

  it("maps bounded recovery rows without changing their generation", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ run_id: uuid(5), dispatch_generation: 3 }],
      error: null,
    }));
    const repository = new SupabaseProductActivationRepository({ rpc });

    await expect(repository.listRecoverableDispatches(360, 25)).resolves.toEqual([
      { runId: uuid(5), dispatchGeneration: 3 },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_recoverable_product_activation_dispatches", {
      p_claim_timeout_seconds: 360,
      p_limit: 25,
    });
  });

  it("falls through an activation-stale result to a cleanup claim", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { result: "stale" }, error: null })
      .mockResolvedValueOnce({
        data: {
          result: "claimed",
          phase: "post_switch_cleanup",
          runId: uuid(5),
          submissionId: uuid(1),
          productId: uuid(2),
          sellerId: uuid(3),
          dispatchGeneration: 2,
          attemptCount: 2,
          attemptToken: uuid(8),
          cleanupItems: [
            {
              destinationKey: "products/old.jpg",
              cleanupKind: "superseded_public",
              expectedSizeBytes: 10,
              expectedSha256: "a".repeat(64),
              expectedEtag: null,
            },
          ],
        },
        error: null,
      });
    const repository = new SupabaseProductActivationRepository({ rpc });

    await expect(
      repository.claimRun({ runId: uuid(5), dispatchGeneration: 2 }, 360),
    ).resolves.toMatchObject({
      result: "claimed",
      phase: "post_switch_cleanup",
      cleanupItems: [{ destinationKey: "products/old.jpg" }],
    });
    expect(rpc).toHaveBeenLastCalledWith("claim_product_activation_cleanup", {
      p_run_id: uuid(5),
      p_dispatch_generation: 2,
      p_claim_timeout_seconds: 360,
      p_continuing_attempt_token: null,
    });
  });

  it("maps idempotent activation recovery results", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "recorded",
          run_id: uuid(5),
          product_id: uuid(2),
          seller_id: uuid(3),
          phase: "activation",
          status: "pending",
          dispatch_generation: 3,
          dispatch_status: "pending",
          dispatch_required: true,
        },
      ],
      error: null,
    }));
    const repository = new SupabaseProductActivationRepository({ rpc });

    const result = await repository.retryActivation({
      runId: uuid(5),
      expectedDispatchGeneration: 2,
      requestId: uuid(6),
      administratorUserId: uuid(7),
    });

    expect(result).toMatchObject({ dispatchGeneration: 3, dispatchRequired: true });
    expect(rpc).toHaveBeenCalledWith("retry_product_activation_run", {
      p_run_id: uuid(5),
      p_expected_dispatch_generation: 2,
      p_request_id: uuid(6),
      p_administrator_user_id: uuid(7),
    });
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
