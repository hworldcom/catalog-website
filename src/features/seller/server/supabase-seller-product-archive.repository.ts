import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database, Json } from "@/lib/supabase/types";

import type {
  SellerProductArchiveOperationInput,
  SellerProductArchiveRepository,
  SellerProductArchiveRepositoryResult,
} from "./seller-product-archive.repository";
import { SellerProductArchiveRepositoryError } from "./seller-product-archive.repository";

type AdminClient = SupabaseClient<Database>;

const resultCodeSchema = z.enum([
  "archived",
  "restoration_draft",
  "product_not_found",
  "product_archive_moderation_active",
  "product_restore_moderation_active",
  "product_moderation_revision_conflict",
  "product_archive_not_allowed",
  "product_restore_not_allowed",
  "product_archive_request_conflict",
  "product_restore_request_conflict",
]);

const operationRowSchema = z
  .object({
    result: resultCodeSchema,
    product_id: z.string().uuid().nullable(),
    product_status: z.enum(["draft", "published", "archived"]).nullable(),
    moderation_revision: z.number().int().positive().nullable(),
    restoration_draft: z.boolean(),
  })
  .strict();

export class SupabaseSellerProductArchiveRepository implements SellerProductArchiveRepository {
  constructor(private readonly database: AdminClient) {}

  archive(input: SellerProductArchiveOperationInput) {
    return this.run("archive_seller_product_with_moderation", input, "archive");
  }

  restore(input: SellerProductArchiveOperationInput) {
    return this.run("restore_seller_product_for_moderation", input, "restore");
  }

  private async run(
    operation: "archive_seller_product_with_moderation" | "restore_seller_product_for_moderation",
    input: SellerProductArchiveOperationInput,
    expectedAction: "archive" | "restore",
  ): Promise<SellerProductArchiveRepositoryResult> {
    const response = await this.database.rpc(
      operation as never,
      {
        p_product_id: input.productId,
        p_expected_moderation_revision: input.expectedModerationRevision,
        p_request_id: input.requestId,
        p_seller_id: input.sellerId,
        p_actor_user_id: input.actorUserId,
      } as never,
    );
    if (response.error) {
      throw new SellerProductArchiveRepositoryError(
        `Seller product ${expectedAction} operation failed.`,
      );
    }

    const parsed = z.array(operationRowSchema).safeParse(response.data as Json);
    if (!parsed.success || parsed.data.length !== 1) {
      throw new SellerProductArchiveRepositoryError(
        `Seller product ${expectedAction} returned an invalid result.`,
      );
    }
    const row = parsed.data[0]!;
    if (row.result !== "archived" && row.result !== "restoration_draft") {
      if (
        row.product_id !== null ||
        row.product_status !== null ||
        row.moderation_revision !== null ||
        row.restoration_draft
      ) {
        throw new SellerProductArchiveRepositoryError(
          `Seller product ${expectedAction} disclosed fields for an error result.`,
        );
      }
      return { result: row.result };
    }
    if (
      row.product_id === null ||
      row.product_status !== "archived" ||
      row.moderation_revision === null ||
      (row.result === "archived" && row.restoration_draft) ||
      (row.result === "restoration_draft" && !row.restoration_draft) ||
      (expectedAction === "archive" && row.result !== "archived") ||
      (expectedAction === "restore" && row.result !== "restoration_draft")
    ) {
      throw new SellerProductArchiveRepositoryError(
        `Seller product ${expectedAction} returned an inconsistent success result.`,
      );
    }

    return row.result === "archived"
      ? {
          result: row.result,
          productId: row.product_id,
          productStatus: row.product_status,
          moderationRevision: row.moderation_revision,
          restorationDraft: false,
        }
      : {
          result: row.result,
          productId: row.product_id,
          productStatus: row.product_status,
          moderationRevision: row.moderation_revision,
          restorationDraft: true,
        };
  }
}
