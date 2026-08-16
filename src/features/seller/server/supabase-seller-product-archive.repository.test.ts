import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseSellerProductArchiveRepository } from "./supabase-seller-product-archive.repository";

const productId = uuid(1);
const sellerId = uuid(2);
const actorUserId = uuid(3);
const requestId = uuid(4);

describe("SupabaseSellerProductArchiveRepository", () => {
  it("calls the protected archive operation and parses success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [success("archived", 4)], error: null });
    const repository = repositoryWith(rpc);

    await expect(repository.archive(input())).resolves.toEqual({
      result: "archived",
      productId,
      productStatus: "archived",
      moderationRevision: 4,
      restorationDraft: false,
    });
    expect(rpc).toHaveBeenCalledWith("archive_seller_product_with_moderation", rpcInput());
  });

  it("calls the protected restore operation and parses its private revision", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [success("restoration_draft", 5)], error: null });
    const repository = repositoryWith(rpc);

    await expect(repository.restore(input())).resolves.toEqual({
      result: "restoration_draft",
      productId,
      productStatus: "archived",
      moderationRevision: 5,
      restorationDraft: true,
    });
    expect(rpc).toHaveBeenCalledWith("restore_seller_product_for_moderation", rpcInput());
  });

  it.each([
    "product_not_found",
    "product_archive_moderation_active",
    "product_moderation_revision_conflict",
    "product_archive_not_allowed",
    "product_archive_request_conflict",
  ] as const)("parses %s without requiring disclosed product fields", async (result) => {
    const repository = repositoryWith(
      vi.fn().mockResolvedValue({ data: [failure(result)], error: null }),
    );

    await expect(repository.archive(input())).resolves.toEqual({ result });
  });

  it("rejects database, malformed, and cross-action success responses", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "raw database error" } })
      .mockResolvedValueOnce({
        data: [{ ...success("archived", 4), product_id: null }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [success("restoration_draft", 5)], error: null });
    const repository = repositoryWith(rpc);

    await expect(repository.archive(input())).rejects.toThrow(
      "Seller product archive operation failed.",
    );
    await expect(repository.archive(input())).rejects.toThrow(
      "Seller product archive returned an inconsistent success result.",
    );
    await expect(repository.archive(input())).rejects.toThrow(
      "Seller product archive returned an inconsistent success result.",
    );
  });
});

function repositoryWith(rpc: ReturnType<typeof vi.fn>) {
  return new SupabaseSellerProductArchiveRepository({ rpc } as unknown as SupabaseClient<Database>);
}

function input() {
  return { productId, sellerId, actorUserId, expectedModerationRevision: 3, requestId };
}

function rpcInput() {
  return {
    p_product_id: productId,
    p_expected_moderation_revision: 3,
    p_request_id: requestId,
    p_seller_id: sellerId,
    p_actor_user_id: actorUserId,
  };
}

function success(result: "archived" | "restoration_draft", revision: number) {
  return {
    result,
    product_id: productId,
    product_status: "archived",
    moderation_revision: revision,
    restoration_draft: result === "restoration_draft",
  };
}

function failure(result: string) {
  return {
    result,
    product_id: null,
    product_status: null,
    moderation_revision: null,
    restoration_draft: false,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
