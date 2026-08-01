import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";

import type {
  ProductDraftDescriptionPatchResult,
  ProductDraftDescriptionRecord,
  ProductDraftDescriptionRepository,
} from "../product-draft-descriptions.repository";
import {
  PRODUCT_DRAFT_DESCRIPTION_LANGUAGES,
  parseProductDraftDescriptionDatabaseSnapshot,
  type ProductDraftDescriptionEntry,
  type ProductDraftDescriptionPatch,
} from "../product-draft-descriptions.types";

type AdminClient = SupabaseClient<Database>;

const descriptionFields =
  "product_draft_id,language,description_text,source,facts_revision,provider,model,pipeline_version,generated_at,updated_at" as const;

export class SupabaseProductDraftDescriptionRepository implements ProductDraftDescriptionRepository {
  constructor(private readonly database: AdminClient) {}

  async get(
    productDraftId: string,
    expectedSellerId: string | null,
  ): Promise<ProductDraftDescriptionRecord> {
    let productQuery = this.database
      .from("products")
      .select("id,status,category_id,facts:product_draft_facts(facts_revision)")
      .eq("id", productDraftId);
    if (expectedSellerId) productQuery = productQuery.eq("seller_id", expectedSellerId);
    const productResponse = await productQuery.maybeSingle();
    if (productResponse.error) throwDatabaseError(productResponse.error);
    if (!productResponse.data) return null;

    const descriptionsResponse = await this.database
      .from("product_draft_descriptions")
      .select(descriptionFields)
      .eq("product_draft_id", productDraftId);
    if (descriptionsResponse.error) throwDatabaseError(descriptionsResponse.error);

    const facts = productResponse.data.facts;
    const currentFactsRevision = facts?.facts_revision ?? null;

    return {
      productDraftId: productResponse.data.id,
      productStatus: productResponse.data.status,
      categoryId: productResponse.data.category_id,
      currentFactsRevision,
      descriptions: mapDescriptionEntries(descriptionsResponse.data ?? [], currentFactsRevision),
    };
  }

  async applyPatch(
    productDraftId: string,
    patch: ProductDraftDescriptionPatch,
    expectedSellerId: string | null,
  ): Promise<ProductDraftDescriptionPatchResult> {
    const response = await this.database.rpc("apply_scoped_product_draft_description_patch", {
      p_product_draft_id: productDraftId,
      p_expected_seller_id: expectedSellerId,
      p_pl_patch_present: hasPatch(patch, "pl"),
      p_pl_description: patch.pl ?? null,
      p_en_patch_present: hasPatch(patch, "en"),
      p_en_description: patch.en ?? null,
      p_de_patch_present: hasPatch(patch, "de"),
      p_de_description: patch.de ?? null,
      p_vi_patch_present: hasPatch(patch, "vi"),
      p_vi_description: patch.vi ?? null,
    });
    if (response.error) throwDatabaseError(response.error);

    const result = response.data?.[0];
    if (!result) throw new Error("ProductDraft description patch returned no result.");

    if (
      result.result === "not_found" ||
      result.result === "facts_missing" ||
      result.result === "not_editable"
    ) {
      return { result: result.result };
    }
    if (result.result !== "applied" || !result.snapshot) {
      throw new Error("ProductDraft description patch returned an invalid result.");
    }

    return {
      result: result.result,
      snapshot: parseProductDraftDescriptionDatabaseSnapshot(result.snapshot as Json),
    };
  }
}

function hasPatch(
  patch: ProductDraftDescriptionPatch,
  language: keyof ProductDraftDescriptionPatch,
) {
  return Object.prototype.hasOwnProperty.call(patch, language);
}

function mapDescriptionEntries(
  rows: Array<{
    language: string;
    description_text: string;
    source: string;
    facts_revision: number | null;
    provider: string | null;
    model: string | null;
    pipeline_version: string | null;
    generated_at: string | null;
    updated_at: string;
  }>,
  currentFactsRevision: number | null,
): ProductDraftDescriptionEntry[] {
  const byLanguage = new Map(rows.map((row) => [row.language, row]));
  return PRODUCT_DRAFT_DESCRIPTION_LANGUAGES.map((language) => {
    const row = byLanguage.get(language);
    if (!row) {
      return {
        language,
        text: null,
        source: null,
        factsRevision: null,
        provider: null,
        model: null,
        pipelineVersion: null,
        generatedAt: null,
        updatedAt: null,
        outdated: null,
      };
    }
    if (row.source !== "human" && row.source !== "model") {
      throw new Error("Stored ProductDraft description source is invalid.");
    }
    return {
      language,
      text: row.description_text,
      source: row.source,
      factsRevision: row.facts_revision,
      provider: row.provider,
      model: row.model,
      pipelineVersion: row.pipeline_version,
      generatedAt: row.generated_at,
      updatedAt: row.updated_at,
      outdated:
        row.facts_revision === null || currentFactsRevision === null
          ? true
          : row.facts_revision < currentFactsRevision,
    };
  });
}

function throwDatabaseError(error: { message: string }): never {
  console.error("[ProductDraft descriptions] Database operation failed.", error);
  throw new Error("ProductDraft description database operation failed.");
}
