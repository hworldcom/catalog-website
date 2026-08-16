import { z } from "zod";

import {
  productModerationEditStartSchema,
  productModerationError,
  type ProductModerationEditStart,
} from "../product-moderation.types";
import {
  productModerationDatabaseError,
  type ProductModerationAdministrator,
} from "./product-moderation.service";

export type ProductModerationActionIdentity = {
  productOwned: boolean;
  submissionOwned: boolean;
  runOwned: boolean;
};

export interface ProductModerationSellerActionsRepository {
  readIdentity(input: {
    productId: string;
    sellerId: string;
    submissionId?: string;
    runId?: string;
  }): Promise<ProductModerationActionIdentity>;
  beginEditing(productId: string, sellerId: string): Promise<ProductModerationEditStart>;
}

const identityRowSchema = z
  .object({
    product_owned: z.boolean(),
    submission_owned: z.boolean(),
    run_owned: z.boolean(),
  })
  .strict();

const beginRowSchema = z
  .object({
    product_id: z.string().uuid(),
    moderation_revision: z.number().int().positive(),
    edit_source: z.enum(["initial_draft", "working_copy"]),
  })
  .strict();

export class SupabaseProductModerationSellerActionsRepository implements ProductModerationSellerActionsRepository {
  constructor(private readonly database: ProductModerationAdministrator) {}

  async readIdentity(input: {
    productId: string;
    sellerId: string;
    submissionId?: string;
    runId?: string;
  }): Promise<ProductModerationActionIdentity> {
    const row = await this.runSingleRow(
      "read_product_moderation_action_identity",
      {
        p_product_id: input.productId,
        p_seller_id: input.sellerId,
        p_submission_id: input.submissionId ?? null,
        p_run_id: input.runId ?? null,
      },
      identityRowSchema,
    );
    return {
      productOwned: row.product_owned,
      submissionOwned: row.submission_owned,
      runOwned: row.run_owned,
    };
  }

  async beginEditing(productId: string, sellerId: string): Promise<ProductModerationEditStart> {
    const row = await this.runSingleRow(
      "begin_product_moderation_editing",
      { p_product_id: productId, p_seller_id: sellerId },
      beginRowSchema,
    );
    return productModerationEditStartSchema.parse({
      productId: row.product_id,
      moderationRevision: row.moderation_revision,
      editSource: row.edit_source,
    });
  }

  private async runSingleRow<T>(
    operation: string,
    parameters: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await this.database.rpc(operation, parameters);
    if (response.error) throw productModerationDatabaseError(response.error);
    const parsed = z.array(schema).safeParse(response.data);
    if (!parsed.success || parsed.data.length !== 1) {
      console.error("[Product moderation seller actions] Database response was invalid.", {
        operation,
      });
      throw productModerationError("product_moderation_unavailable");
    }
    return parsed.data[0]!;
  }
}
