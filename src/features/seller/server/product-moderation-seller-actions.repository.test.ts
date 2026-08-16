import { describe, expect, it, vi } from "vitest";

import type { ProductModerationAdministrator } from "./product-moderation.service";
import { SupabaseProductModerationSellerActionsRepository } from "./product-moderation-seller-actions.repository";

describe("SupabaseProductModerationSellerActionsRepository", () => {
  it("reads product and immutable resource identity without exposing rows", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ product_owned: true, submission_owned: true, run_owned: false }],
      error: null,
    });
    const repository = new SupabaseProductModerationSellerActionsRepository({
      rpc,
    } as ProductModerationAdministrator);

    await expect(
      repository.readIdentity({
        productId: uuid(1),
        sellerId: uuid(2),
        submissionId: uuid(3),
      }),
    ).resolves.toEqual({ productOwned: true, submissionOwned: true, runOwned: false });
    expect(rpc).toHaveBeenCalledWith("read_product_moderation_action_identity", {
      p_product_id: uuid(1),
      p_seller_id: uuid(2),
      p_submission_id: uuid(3),
      p_run_id: null,
    });
  });

  it("maps the locked begin-edit response", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          product_id: uuid(1),
          moderation_revision: 8,
          edit_source: "working_copy",
        },
      ],
      error: null,
    });
    const repository = new SupabaseProductModerationSellerActionsRepository({
      rpc,
    } as ProductModerationAdministrator);

    await expect(repository.beginEditing(uuid(1), uuid(2))).resolves.toEqual({
      productId: uuid(1),
      moderationRevision: 8,
      editSource: "working_copy",
    });
    expect(rpc).toHaveBeenCalledWith("begin_product_moderation_editing", {
      p_product_id: uuid(1),
      p_seller_id: uuid(2),
    });
  });

  it("rejects malformed database responses as temporary failures", async () => {
    const repository = new SupabaseProductModerationSellerActionsRepository({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as ProductModerationAdministrator);

    await expect(repository.beginEditing(uuid(1), uuid(2))).rejects.toMatchObject({
      code: "product_moderation_unavailable",
      statusCode: 503,
    });
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
