import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database, Json } from "@/lib/supabase/types";

import type { ProductModerationStatusRepository } from "./product-moderation-status.repository";
import { ProductModerationStatusRepositoryError } from "./product-moderation-status.repository";

type DatabaseClient = SupabaseClient<Database>;

export const productModerationStatusFieldsSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["draft", "published", "archived"]),
    marketplace_visibility: z.enum([
      "not_published",
      "visible",
      "storefront_disabled",
      "seller_approval_required",
    ]),
    moderation_revision: z.number().int().positive(),
    has_working_copy: z.boolean(),
    review_submission_id: z.string().uuid().nullable(),
    review_kind: z.enum(["initial_publication", "update"]).nullable(),
    review_revision: z.number().int().positive().nullable(),
    review_status: z
      .enum(["pending", "changes_requested", "approved", "rejected", "withdrawn"])
      .nullable(),
    review_submitted_at: z.string().nullable(),
    review_decided_at: z.string().nullable(),
    review_seller_visible_reason: z.string().nullable(),
    activation_run_id: z.string().uuid().nullable(),
    activation_phase: z
      .enum(["activation", "pre_switch_cleanup", "post_switch_cleanup"])
      .nullable(),
    activation_status: z
      .enum(["pending", "running", "failed", "cleanup_required", "completed", "abandoned"])
      .nullable(),
    activation_dispatch_status: z.enum(["pending", "dispatched", "failed"]).nullable(),
    activation_dispatch_generation: z.number().int().positive().nullable(),
    activation_dispatch_error_code: z.string().nullable(),
    activation_error_code: z.string().nullable(),
    can_edit: z.boolean(),
    can_submit: z.boolean(),
    can_withdraw: z.boolean(),
    can_abandon_failed_activation: z.boolean(),
    can_retry_abandonment_cleanup: z.boolean(),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
  })
  .strict();

const submittedImageSchema = z
  .object({
    productDraftImageId: z.string().uuid(),
    position: z.number().int().nonnegative(),
    isCover: z.boolean(),
  })
  .strict();

const detailRowSchema = productModerationStatusFieldsSchema
  .extend({
    title: z.string(),
    product_code: z.string().nullable(),
    cover_image_id: z.string().uuid().nullable(),
    cover_image_url: z.string().nullable(),
    price: z.coerce.number().nullable(),
    currency: z.string(),
    moq: z.number().int().nullable(),
    pack_size: z.string().nullable(),
    stock: z.enum(["in_stock", "low_stock", "out_of_stock", "made_to_order"]),
    created_at: z.string(),
    submitted_snapshot_schema_version: z.literal(1).nullable(),
    submitted_snapshot_json: z.custom<Json>().nullable(),
    submitted_images: z.array(submittedImageSchema).nullable(),
  })
  .strict();

export class SupabaseProductModerationStatusRepository implements ProductModerationStatusRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getOwnedStatus(productId: string, sellerId: string) {
    const response = await this.database.rpc(
      "read_seller_product_moderation_status" as never,
      {
        p_product_id: productId,
        p_seller_id: sellerId,
      } as never,
    );
    if (response.error) {
      throw new ProductModerationStatusRepositoryError(
        `Product moderation status read failed: ${response.error.message}`,
      );
    }
    const parsed = z.array(detailRowSchema).safeParse(response.data as Json);
    if (!parsed.success || parsed.data.length > 1) {
      throw new ProductModerationStatusRepositoryError(
        "Product moderation status read returned an invalid response.",
      );
    }
    return parsed.data[0] ?? null;
  }
}
