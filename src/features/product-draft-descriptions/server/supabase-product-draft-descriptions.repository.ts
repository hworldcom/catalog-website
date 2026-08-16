import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";
import { readProductModerationEditState } from "@/features/seller/server/product-moderation-edit-state";

import type {
  ProductDraftDescriptionPatchResult,
  ProductDraftDescriptionRecord,
  ProductDraftDescriptionRepository,
} from "../product-draft-descriptions.repository";
import {
  PRODUCT_DRAFT_DESCRIPTION_LANGUAGES,
  parseProductDraftDescriptionDatabaseSnapshot,
  ProductDraftDescriptionError,
  type ProductDraftDescriptionEntry,
  type ProductDraftDescriptionPatch,
} from "../product-draft-descriptions.types";

type AdminClient = SupabaseClient<Database>;

export class SupabaseProductDraftDescriptionRepository implements ProductDraftDescriptionRepository {
  constructor(private readonly database: AdminClient) {}

  async get(
    productDraftId: string,
    expectedSellerId: string | null,
  ): Promise<ProductDraftDescriptionRecord> {
    const state = await readProductModerationEditState(
      this.database,
      productDraftId,
      expectedSellerId,
    );
    if (!state) return null;
    const currentFactsRevision = state.snapshot.facts?.factsRevision ?? null;

    return {
      productDraftId: state.productId,
      moderationRevision: state.revision,
      editable: state.editable,
      productStatus: state.productStatus,
      categoryId: state.snapshot.categoryId,
      currentFactsRevision,
      descriptions: mapWorkingDescriptionEntries(state.snapshot.descriptions, currentFactsRevision),
    };
  }

  async applyPatch(
    productDraftId: string,
    patch: ProductDraftDescriptionPatch,
    expectedSellerId: string | null,
    expectedModerationRevision: number,
  ): Promise<ProductDraftDescriptionPatchResult> {
    const response = await this.database.rpc("apply_initial_product_draft_description_patch", {
      p_product_draft_id: productDraftId,
      p_expected_seller_id: expectedSellerId,
      p_expected_moderation_revision: expectedModerationRevision,
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
    if (result.result !== "applied" || !result.snapshot || result.moderation_revision === null) {
      throw new Error("ProductDraft description patch returned an invalid result.");
    }

    const snapshot = parseProductDraftDescriptionDatabaseSnapshot(result.snapshot as Json);
    return {
      result: result.result,
      snapshot: {
        ...snapshot,
        moderationRevision: result.moderation_revision,
      },
    };
  }
}

function mapWorkingDescriptionEntries(
  rows: Array<{
    language: "pl" | "en" | "de" | "vi";
    descriptionText: string;
    source: "human" | "model";
    factsRevision: number | null;
    provider: string | null;
    model: string | null;
    pipelineVersion: string | null;
    generatedAt: string | null;
    updatedAt?: string | null;
  }>,
  currentFactsRevision: number | null,
): ProductDraftDescriptionEntry[] {
  const byLanguage = new Map(rows.map((row) => [row.language, row]));
  return PRODUCT_DRAFT_DESCRIPTION_LANGUAGES.map((language) => {
    const row = byLanguage.get(language);
    return {
      language,
      text: row?.descriptionText ?? null,
      source: row?.source ?? null,
      factsRevision: row?.factsRevision ?? null,
      provider: row?.provider ?? null,
      model: row?.model ?? null,
      pipelineVersion: row?.pipelineVersion ?? null,
      generatedAt: row?.generatedAt ?? null,
      updatedAt: row?.updatedAt ?? null,
      outdated:
        !row || currentFactsRevision === null
          ? null
          : row.factsRevision === null || row.factsRevision < currentFactsRevision,
    };
  });
}

function hasPatch(
  patch: ProductDraftDescriptionPatch,
  language: keyof ProductDraftDescriptionPatch,
) {
  return Object.prototype.hasOwnProperty.call(patch, language);
}

function throwDatabaseError(error: { message: string }): never {
  if (error.message.includes("product_moderation_working_revision_conflict")) {
    throw new ProductDraftDescriptionError(
      409,
      "product_moderation_working_revision_conflict",
      "The ProductDraft changed. Refresh it before saving again.",
    );
  }
  if (error.message.includes("product_moderation_submission_conflict")) {
    throw new ProductDraftDescriptionError(
      409,
      "product_moderation_submission_conflict",
      "The ProductDraft is locked by an active moderation submission.",
    );
  }
  console.error("[ProductDraft descriptions] Database operation failed.", error);
  throw new Error("ProductDraft description database operation failed.");
}
