import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";

import type {
  ProductDraftFactsPatchResult,
  ProductDraftFactsReadResult,
  ProductDraftFactsRepository,
} from "../product-draft-facts.repository";
import {
  productDraftFactsDocumentSchema,
  type ProductDraftFactsPatch,
} from "../product-draft-facts.types";

type AdminClient = SupabaseClient<Database>;

export class SupabaseProductDraftFactsRepository implements ProductDraftFactsRepository {
  constructor(private readonly database: AdminClient) {}

  async get(
    productDraftId: string,
    expectedSellerId: string | null,
  ): Promise<ProductDraftFactsReadResult> {
    let productQuery = this.database
      .from("products")
      .select(
        "id,status,facts:product_draft_facts(product_draft_id,facts_json,facts_revision,updated_at)",
      )
      .eq("id", productDraftId);
    if (expectedSellerId) productQuery = productQuery.eq("seller_id", expectedSellerId);

    const productResult = await productQuery.maybeSingle();
    if (productResult.error) throwDatabaseError(productResult.error);
    if (!productResult.data) return null;

    const facts = productResult.data.facts;

    return {
      productDraftId: productResult.data.id,
      productStatus: productResult.data.status,
      factsRecord: facts
        ? {
            productDraftId: facts.product_draft_id,
            facts: parseStoredFacts(facts.facts_json),
            factsRevision: facts.facts_revision,
            updatedAt: facts.updated_at,
          }
        : null,
    };
  }

  async applyPatch(
    productDraftId: string,
    patch: ProductDraftFactsPatch,
    expectedSellerId: string | null,
  ): Promise<ProductDraftFactsPatchResult> {
    const response = await this.database.rpc("apply_product_draft_facts_patch", {
      p_product_draft_id: productDraftId,
      p_normalized_patch: patch as Json,
      p_expected_seller_id: expectedSellerId,
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
      !result.product_status
    ) {
      throw new Error("ProductDraft facts patch returned an incomplete snapshot.");
    }

    return {
      result: result.result,
      productDraftId: result.product_draft_id,
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
  console.error("[ProductDraft facts] Database operation failed.", error);
  throw new Error("ProductDraft facts database operation failed.");
}
