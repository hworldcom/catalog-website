import { describe, expect, it, vi } from "vitest";

import { SupabaseAdministratorModerationRepository } from "./supabase-administrator-moderation.repository";

describe("SupabaseAdministratorModerationRepository", () => {
  it("passes normalized filters and the decoded keyset to the single queue function", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const repository = new SupabaseAdministratorModerationRepository({ rpc });

    await repository.list(
      {
        submissionType: "product_update",
        reviewStatus: "approved",
        activationStatus: "failed",
        sellerId: uuid(1),
        limit: 50,
      },
      {
        version: 1,
        submittedAt: "2026-08-18T10:00:00.000Z",
        submissionType: "product_update",
        submissionId: uuid(2),
        filters: {
          submissionType: "product_update",
          reviewStatus: "approved",
          activationStatus: "failed",
          sellerId: uuid(1),
          limit: 50,
        },
      },
    );

    expect(rpc).toHaveBeenCalledWith("list_administrator_moderation_requests", {
      p_submission_type: "product_update",
      p_review_status: "approved",
      p_activation_status: "failed",
      p_seller_id: uuid(1),
      p_limit: 50,
      p_after_submitted_at: "2026-08-18T10:00:00.000Z",
      p_after_submission_type: "product_update",
      p_after_submission_id: uuid(2),
    });
  });

  it("returns null details without conflating seller and product reads", async () => {
    const rpc = vi.fn(async (_operation: string, _parameters: Record<string, unknown>) => ({
      data: null,
      error: null,
    }));
    const repository = new SupabaseAdministratorModerationRepository({ rpc });

    await expect(repository.getSeller(uuid(3))).resolves.toBeNull();
    await expect(repository.getProduct(uuid(4))).resolves.toBeNull();
    expect(rpc.mock.calls.map(([operation]) => operation)).toEqual([
      "read_administrator_seller_moderation_request",
      "read_administrator_product_moderation_request",
    ]);
  });

  it("rejects malformed database responses and wraps database failures", async () => {
    const malformed = new SupabaseAdministratorModerationRepository({
      rpc: vi.fn(async () => ({ data: [{ submission_id: "invalid" }], error: null })),
    });
    const failed = new SupabaseAdministratorModerationRepository({
      rpc: vi.fn(async () => ({ data: null, error: { message: "offline" } })),
    });

    await expect(
      malformed.list(
        {
          submissionType: null,
          reviewStatus: "pending",
          activationStatus: null,
          sellerId: null,
          limit: 25,
        },
        null,
      ),
    ).rejects.toThrow(/invalid response/);
    await expect(failed.getSeller(uuid(5))).rejects.toThrow(/offline/);
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
