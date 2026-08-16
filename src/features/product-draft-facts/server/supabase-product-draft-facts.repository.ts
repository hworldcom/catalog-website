import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";
import { readProductModerationEditState } from "@/features/seller/server/product-moderation-edit-state";

import type {
  ProductDraftFactsPatchResult,
  ProductDraftFactsReadResult,
  ProductDraftFactsRepository,
} from "../product-draft-facts.repository";
import {
  productDraftFactsDocumentSchema,
  ProductDraftFactsError,
  type ProductDraftFactsPatch,
} from "../product-draft-facts.types";

type AdminClient = SupabaseClient<Database>;

export class SupabaseProductDraftFactsRepository implements ProductDraftFactsRepository {
  constructor(private readonly database: AdminClient) {}

  async get(
    productDraftId: string,
    expectedSellerId: string | null,
  ): Promise<ProductDraftFactsReadResult> {
    const state = await readProductModerationEditState(
      this.database,
      productDraftId,
      expectedSellerId,
    );
    if (!state) return null;
    const facts = state.snapshot.facts;

    return {
      productDraftId: state.productId,
      moderationRevision: state.revision,
      editable: state.editable,
      productStatus: state.productStatus,
      factsRecord: facts
        ? {
            productDraftId: state.productId,
            facts: parseStoredFacts(facts.facts as Json),
            factsRevision: facts.factsRevision,
            updatedAt: new Date().toISOString(),
          }
        : null,
    };
  }

  async applyPatch(
    productDraftId: string,
    patch: ProductDraftFactsPatch,
    expectedSellerId: string | null,
    expectedModerationRevision: number,
  ): Promise<ProductDraftFactsPatchResult> {
    const response = await this.database.rpc("apply_initial_product_draft_facts_patch", {
      p_product_draft_id: productDraftId,
      p_normalized_patch: patch as Json,
      p_expected_seller_id: expectedSellerId,
      p_expected_moderation_revision: expectedModerationRevision,
    });
    if (response.error) throwDatabaseError(response.error);

    const result = response.data?.[0];
    if (!result) throw new Error("ProductDraft facts patch returned no result.");

    if (result.result === "not_found" || result.result === "facts_missing") {
      return { result: result.result };
    }

    if (result.result === "not_editable") {
      if (!result.product_draft_id || !result.product_status) {
        throw new Error("ProductDraft facts patch returned an incomplete not-editable result.");
      }
      return {
        result: "not_editable",
        productDraftId: result.product_draft_id,
        productStatus: result.product_status,
      };
    }

    if (result.result !== "updated" && result.result !== "unchanged") {
      throw new Error("ProductDraft facts patch returned an unknown result.");
    }
    if (
      !result.product_draft_id ||
      !result.facts_json ||
      result.facts_revision === null ||
      !result.updated_at ||
      !result.product_status ||
      result.moderation_revision === null
    ) {
      throw new Error("ProductDraft facts patch returned an incomplete snapshot.");
    }

    return {
      result: result.result,
      productDraftId: result.product_draft_id,
      moderationRevision: result.moderation_revision,
      facts: parseStoredFacts(result.facts_json),
      factsRevision: result.facts_revision,
      updatedAt: result.updated_at,
      productStatus: result.product_status,
    };
  }
}

function parseStoredFacts(value: Json) {
  const result = productDraftFactsDocumentSchema.safeParse(value);
  if (!result.success) throw new Error("Stored ProductDraft facts are invalid.");
  return result.data;
}

function throwDatabaseError(error: { message: string }): never {
  if (error.message.includes("product_moderation_working_revision_conflict")) {
    throw new ProductDraftFactsError(
      409,
      "product_moderation_working_revision_conflict",
      "The ProductDraft changed. Refresh it before saving again.",
    );
  }
  if (error.message.includes("product_moderation_submission_conflict")) {
    throw new ProductDraftFactsError(
      409,
      "product_moderation_submission_conflict",
      "The ProductDraft is locked by an active moderation submission.",
    );
  }
  console.error("[ProductDraft facts] Database operation failed.", error);
  throw new Error("ProductDraft facts database operation failed.");
}
