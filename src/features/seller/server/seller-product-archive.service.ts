import { z } from "zod";

import { sellerProductIdSchema } from "../seller-product-write.types";
import {
  SellerProductArchiveError,
  type SellerProductArchiveSnapshot,
  type SellerProductRestoreSnapshot,
} from "../seller-product-archive.types";
import type {
  SellerProductArchiveOperationInput,
  SellerProductArchiveRepository,
  SellerProductArchiveRepositoryResult,
} from "./seller-product-archive.repository";

const uuidSchema = z.string().uuid();

type OperationInput = {
  productId: string;
  sellerId: string | null;
  actorUserId: string;
  expectedModerationRevision: number;
  requestId: string;
};

export class SellerProductArchiveService {
  constructor(private readonly products: SellerProductArchiveRepository) {}

  async archive(input: OperationInput): Promise<SellerProductArchiveSnapshot> {
    const normalized = validateInput(input);
    const result = await this.execute("archive", normalized);
    if (result.result !== "archived") throw operationError(result.result);
    return {
      productId: result.productId,
      productStatus: result.productStatus,
      moderationRevision: result.moderationRevision,
    };
  }

  async restore(input: OperationInput): Promise<SellerProductRestoreSnapshot> {
    const normalized = validateInput(input);
    const result = await this.execute("restore", normalized);
    if (result.result !== "restoration_draft") throw operationError(result.result);
    return {
      productId: result.productId,
      productStatus: result.productStatus,
      moderationRevision: result.moderationRevision,
      restorationDraft: true,
      editRoute: `/seller/products/${result.productId}`,
    };
  }

  private async execute(
    action: "archive" | "restore",
    input: SellerProductArchiveOperationInput,
  ): Promise<SellerProductArchiveRepositoryResult> {
    try {
      return await this.products[action](input);
    } catch (error) {
      console.error(`[Seller product ${action}] Database operation failed.`, {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
      throw operationUnavailable();
    }
  }
}

function validateInput(input: OperationInput): SellerProductArchiveOperationInput {
  if (
    !input.sellerId ||
    !sellerProductIdSchema.safeParse(input.productId).success ||
    !uuidSchema.safeParse(input.sellerId).success ||
    !uuidSchema.safeParse(input.actorUserId).success ||
    !uuidSchema.safeParse(input.requestId).success ||
    !Number.isSafeInteger(input.expectedModerationRevision) ||
    input.expectedModerationRevision < 1
  ) {
    throw productNotFound();
  }
  return { ...input, sellerId: input.sellerId };
}

function operationError(
  code: Exclude<SellerProductArchiveRepositoryResult["result"], "archived" | "restoration_draft">,
) {
  const messages: Record<typeof code, string> = {
    product_not_found: "The product was not found.",
    product_archive_moderation_active:
      "Retry or abandon active publication work before archiving this product.",
    product_restore_moderation_active:
      "Complete active publication or cleanup before restoring this product.",
    product_moderation_revision_conflict:
      "The product changed. Refresh the product list and try again.",
    product_archive_not_allowed: "This product cannot be archived from its current state.",
    product_restore_not_allowed: "This archived product cannot be restored.",
    product_archive_request_conflict:
      "This archive request identifier was already used for another action.",
    product_restore_request_conflict:
      "This restore request identifier was already used for another action.",
  };
  return new SellerProductArchiveError(
    code === "product_not_found" ? 404 : 409,
    code,
    messages[code],
  );
}

function productNotFound(): SellerProductArchiveError {
  return new SellerProductArchiveError(404, "product_not_found", "The product was not found.");
}

function operationUnavailable(): SellerProductArchiveError {
  return new SellerProductArchiveError(
    503,
    "product_moderation_activation_unavailable",
    "Product archive and restore are temporarily unavailable.",
  );
}
