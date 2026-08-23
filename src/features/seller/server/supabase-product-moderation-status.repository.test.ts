import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseProductModerationStatusRepository } from "./supabase-product-moderation-status.repository";

describe("SupabaseProductModerationStatusRepository", () => {
  it("calls the passive seller-owned detail operation and validates its response", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [detailRow()], error: null });
    const repository = new SupabaseProductModerationStatusRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    const result = await repository.getOwnedStatus(uuid(1), uuid(900));

    expect(rpc).toHaveBeenCalledWith("read_seller_product_moderation_status", {
      p_product_id: uuid(1),
      p_seller_id: uuid(900),
    });
    expect(result?.submitted_images).toEqual([
      { productDraftImageId: uuid(101), position: 0, isCover: true },
    ]);
  });

  it("rejects malformed and multiple-row database responses", async () => {
    const malformed = new SupabaseProductModerationStatusRepository({
      rpc: vi.fn().mockResolvedValue({ data: [{ id: "invalid" }], error: null }),
    } as unknown as SupabaseClient<Database>);
    await expect(malformed.getOwnedStatus(uuid(1), uuid(900))).rejects.toThrow(/invalid response/);

    const multiple = new SupabaseProductModerationStatusRepository({
      rpc: vi.fn().mockResolvedValue({ data: [detailRow(), detailRow()], error: null }),
    } as unknown as SupabaseClient<Database>);
    await expect(multiple.getOwnedStatus(uuid(1), uuid(900))).rejects.toThrow(/invalid response/);
  });
});

function detailRow() {
  return {
    id: uuid(1),
    title: "Submitted title",
    product_code: null,
    cover_image_id: uuid(101),
    cover_image_url: null,
    price: null,
    currency: "EUR",
    moq: 10,
    pack_size: "10 pieces",
    stock: "in_stock",
    status: "draft",
    marketplace_visibility: "not_published",
    moderation_revision: 3,
    has_working_copy: false,
    created_at: "2026-08-16T09:00:00.000Z",
    review_submission_id: uuid(2),
    review_kind: "initial_publication",
    review_revision: 3,
    review_status: "pending",
    review_submitted_at: "2026-08-16T10:00:00.000Z",
    review_decided_at: null,
    review_seller_visible_reason: null,
    activation_run_id: null,
    activation_phase: null,
    activation_status: null,
    activation_dispatch_status: null,
    activation_dispatch_generation: null,
    activation_dispatch_error_code: null,
    activation_error_code: null,
    can_edit: false,
    can_submit: false,
    can_withdraw: true,
    can_abandon_failed_activation: false,
    can_retry_abandonment_cleanup: false,
    can_archive: true,
    can_restore: false,
    submitted_snapshot_schema_version: 1,
    submitted_snapshot_json: { title: "Submitted title" },
    submitted_images: [{ productDraftImageId: uuid(101), position: 0, isCover: true }],
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
