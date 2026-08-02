import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  parseProductDraftDescriptionDatabaseSnapshot,
  PRODUCT_DRAFT_DESCRIPTION_LANGUAGES,
  type ProductDraftDescriptionSnapshot,
} from "@/features/product-draft-descriptions/product-draft-descriptions.types";
import { productDraftFactsDocumentSchema } from "@/features/product-draft-facts/product-draft-facts.types";
import type { ProductDraftTitleSnapshot } from "@/features/product-draft-title/product-draft-title.types";
import type { Database, Json } from "@/lib/supabase/types";

import type {
  ProductDescriptionGenerationClaimResult,
  ProductDescriptionGenerationFailureResult,
  ProductDescriptionGenerationFinalizationResult,
  ProductDescriptionGenerationRepository,
} from "../product-draft-description-generation.repository";

type AdminClient = SupabaseClient<Database>;

const claimResultSchema = z.enum([
  "claimed",
  "not_found",
  "not_editable",
  "category_missing",
  "cover_missing",
  "cover_not_ready",
  "facts_missing",
  "no_writable_targets",
  "in_progress",
]);
const finalizationResultSchema = z.enum([
  "completed",
  "not_found",
  "not_editable",
  "facts_missing",
  "input_changed",
  "superseded",
]);
const failureResultSchema = z.enum(["failed", "not_found", "superseded"]);
const coverSourceSchema = z.enum(["private_draft", "public_product_upload"]);
const supportedCoverContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
const titleSnapshotSchema = z
  .object({
    productDraftId: z.string().uuid(),
    title: z.string(),
    titleSource: z.enum(["human", "model"]).nullable(),
    productStatus: z.enum(["draft", "published", "archived"]),
    editable: z.boolean(),
  })
  .strict();

export class SupabaseProductDraftDescriptionGenerationRepository implements ProductDescriptionGenerationRepository {
  constructor(private readonly database: AdminClient) {}

  async claim(
    productDraftId: string,
    expectedSellerId: string,
  ): Promise<ProductDescriptionGenerationClaimResult> {
    const response = await this.database.rpc("claim_product_draft_description_generation", {
      p_product_draft_id: productDraftId,
      p_expected_seller_id: expectedSellerId,
    });
    if (response.error) throwDatabaseError(response.error);

    const row = response.data?.[0];
    if (!row) throw invalidDatabaseResult("claim");

    const result = claimResultSchema.safeParse(row.result);
    if (!result.success) throw invalidDatabaseResult("claim");
    if (result.data !== "claimed") return { result: result.data };

    const facts = productDraftFactsDocumentSchema.safeParse(row.facts_json);
    const humanLanguages = z
      .array(z.enum(PRODUCT_DRAFT_DESCRIPTION_LANGUAGES))
      .max(PRODUCT_DRAFT_DESCRIPTION_LANGUAGES.length)
      .safeParse(row.human_languages);
    const factsRevision = row.facts_revision;
    const cover = parseCover(row);
    if (
      !row.attempt_token ||
      !row.category_id ||
      !row.category_slug?.trim() ||
      !row.category_name?.trim() ||
      typeof factsRevision !== "number" ||
      !Number.isInteger(factsRevision) ||
      factsRevision < 1 ||
      typeof row.title_blank !== "boolean" ||
      !facts.success ||
      !humanLanguages.success ||
      new Set(humanLanguages.data).size !== humanLanguages.data.length ||
      !cover
    ) {
      throw invalidDatabaseResult("claim");
    }

    return {
      result: "claimed",
      attemptToken: row.attempt_token,
      category: {
        id: row.category_id,
        slug: row.category_slug,
        name: row.category_name,
      },
      factsRevision,
      facts: facts.data,
      humanLanguages: humanLanguages.data,
      titleBlank: row.title_blank,
      cover,
    };
  }

  async finalize(
    input: Parameters<ProductDescriptionGenerationRepository["finalize"]>[0],
  ): Promise<ProductDescriptionGenerationFinalizationResult> {
    const response = await this.database.rpc("finalize_product_draft_description_generation", {
      p_product_draft_id: input.productDraftId,
      p_expected_seller_id: input.expectedSellerId,
      p_attempt_token: input.claim.attemptToken,
      p_expected_category_id: input.claim.category.id,
      p_expected_facts_revision: input.claim.factsRevision,
      p_expected_cover_source: input.claim.cover.source,
      p_expected_cover_image_id:
        input.claim.cover.source === "private_draft" ? input.claim.cover.imageId : null,
      p_expected_cover_image_url:
        input.claim.cover.source === "public_product_upload" ? input.claim.cover.imageUrl : null,
      p_expected_cover_storage_bucket:
        input.claim.cover.source === "private_draft" ? input.claim.cover.storageBucket : null,
      p_expected_cover_object_key:
        input.claim.cover.source === "private_draft" ? input.claim.cover.objectKey : null,
      p_expected_cover_content_type:
        input.claim.cover.source === "private_draft" ? input.claim.cover.contentType : null,
      p_expected_cover_size_bytes:
        input.claim.cover.source === "private_draft" ? input.claim.cover.sizeBytes : null,
      p_descriptions: input.output.descriptions,
      p_title_proposal: input.output.titleProposal,
      p_provider: input.provider,
      p_model: input.model,
      p_pipeline_version: input.pipelineVersion,
      p_generated_at: input.generatedAt,
    });
    if (response.error) throwDatabaseError(response.error);

    const row = response.data?.[0];
    if (!row) throw invalidDatabaseResult("finalization");
    const result = finalizationResultSchema.safeParse(row.result);
    if (!result.success) throw invalidDatabaseResult("finalization");
    if (result.data !== "completed") return { result: result.data };
    if (!row.description_snapshot || !row.title_snapshot) {
      throw invalidDatabaseResult("finalization");
    }

    return {
      result: "completed",
      descriptionSnapshot: publicDescriptionSnapshot(row.description_snapshot as Json),
      titleSnapshot: parseTitleSnapshot(row.title_snapshot),
    };
  }

  async fail(
    input: Parameters<ProductDescriptionGenerationRepository["fail"]>[0],
  ): Promise<ProductDescriptionGenerationFailureResult> {
    const response = await this.database.rpc("fail_product_draft_description_generation", {
      p_product_draft_id: input.productDraftId,
      p_expected_seller_id: input.expectedSellerId,
      p_attempt_token: input.attemptToken,
      p_error_code: input.errorCode,
    });
    if (response.error) throwDatabaseError(response.error);

    const result = failureResultSchema.safeParse(response.data);
    if (!result.success) throw invalidDatabaseResult("failure finalization");
    return result.data;
  }
}

function parseCover(row: {
  cover_source?: string | null;
  cover_image_id?: string | null;
  cover_image_url?: string | null;
  cover_storage_bucket?: string | null;
  cover_object_key?: string | null;
  cover_content_type?: string | null;
  cover_size_bytes?: number | null;
}) {
  const source = coverSourceSchema.safeParse(row.cover_source);
  if (!source.success) return null;
  if (source.data === "public_product_upload") {
    if (
      !row.cover_image_url?.trim() ||
      row.cover_image_id !== null ||
      row.cover_storage_bucket !== null ||
      row.cover_object_key !== null ||
      row.cover_content_type !== null ||
      row.cover_size_bytes !== null
    ) {
      return null;
    }
    return { source: source.data, imageUrl: row.cover_image_url } as const;
  }

  const contentType = supportedCoverContentTypeSchema.safeParse(row.cover_content_type);
  if (
    !row.cover_image_id ||
    row.cover_image_url !== null ||
    row.cover_storage_bucket !== "product-draft-images" ||
    !row.cover_object_key?.trim() ||
    !contentType.success ||
    typeof row.cover_size_bytes !== "number" ||
    !Number.isSafeInteger(row.cover_size_bytes) ||
    row.cover_size_bytes <= 0
  ) {
    return null;
  }
  return {
    source: source.data,
    imageId: row.cover_image_id,
    storageBucket: row.cover_storage_bucket,
    objectKey: row.cover_object_key,
    contentType: contentType.data,
    sizeBytes: row.cover_size_bytes,
  } as const;
}

function publicDescriptionSnapshot(value: Json): ProductDraftDescriptionSnapshot {
  const snapshot = parseProductDraftDescriptionDatabaseSnapshot(value);
  const generationEligibility =
    snapshot.productStatus !== "draft"
      ? { eligible: false, reason: "product_not_draft" as const }
      : snapshot.categoryId
        ? { eligible: true, reason: null }
        : { eligible: false, reason: "category_missing" as const };

  return {
    productDraftId: snapshot.productDraftId,
    productStatus: snapshot.productStatus,
    currentFactsRevision: snapshot.currentFactsRevision,
    generationEligibility,
    descriptions: snapshot.descriptions,
  };
}

function parseTitleSnapshot(value: unknown): ProductDraftTitleSnapshot {
  const result = titleSnapshotSchema.safeParse(value);
  if (!result.success) throw invalidDatabaseResult("title snapshot");
  return result.data;
}

function invalidDatabaseResult(operation: string): Error {
  return new Error(`Product description generation ${operation} returned an invalid result.`);
}

function throwDatabaseError(error: { message: string }): never {
  console.error("[Product description generation] Database operation failed.", error);
  throw new Error("Product description generation database operation failed.");
}
