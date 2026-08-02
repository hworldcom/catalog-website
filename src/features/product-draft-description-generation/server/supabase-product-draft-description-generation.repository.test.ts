import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseProductDraftDescriptionGenerationRepository } from "./supabase-product-draft-description-generation.repository";

const productDraftId = uuid(1);
const sellerId = uuid(2);

describe("SupabaseProductDraftDescriptionGenerationRepository", () => {
  it("claims through the seller-scoped atomic function and validates provider input", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "claimed",
          attempt_token: uuid(3),
          category_id: uuid(4),
          category_slug: "t-shirts",
          category_name: "T-shirts",
          facts_revision: 2,
          facts_json: facts(),
          human_languages: ["en"],
          title_blank: true,
          cover_source: "private_draft",
          cover_image_id: uuid(5),
          cover_image_url: null,
          cover_storage_bucket: "product-draft-images",
          cover_object_key: "drafts/cover.jpg",
          cover_content_type: "image/jpeg",
          cover_size_bytes: 4,
        },
      ],
      error: null,
    }));
    const repository = repositoryWith(rpc);

    await expect(repository.claim(productDraftId, sellerId)).resolves.toEqual({
      result: "claimed",
      attemptToken: uuid(3),
      category: { id: uuid(4), slug: "t-shirts", name: "T-shirts" },
      factsRevision: 2,
      facts: facts(),
      humanLanguages: ["en"],
      titleBlank: true,
      cover: {
        source: "private_draft",
        imageId: uuid(5),
        storageBucket: "product-draft-images",
        objectKey: "drafts/cover.jpg",
        contentType: "image/jpeg",
        sizeBytes: 4,
      },
    });
    expect(rpc).toHaveBeenCalledWith("claim_product_draft_description_generation", {
      p_product_draft_id: productDraftId,
      p_expected_seller_id: sellerId,
    });
  });

  it("finalizes all generated fields and parses complete public snapshots", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "completed",
          description_snapshot: descriptionSnapshot(),
          title_snapshot: {
            productDraftId,
            title: "Cotton T-shirt",
            titleSource: "model",
            productStatus: "draft",
            editable: true,
          },
        },
      ],
      error: null,
    }));
    const repository = repositoryWith(rpc);

    const result = await repository.finalize({
      productDraftId,
      expectedSellerId: sellerId,
      claim: {
        result: "claimed",
        attemptToken: uuid(3),
        category: { id: uuid(4), slug: "t-shirts", name: "T-shirts" },
        factsRevision: 2,
        facts: facts(),
        humanLanguages: ["en"],
        titleBlank: true,
        cover: {
          source: "private_draft",
          imageId: uuid(5),
          storageBucket: "product-draft-images",
          objectKey: "drafts/cover.jpg",
          contentType: "image/jpeg",
          sizeBytes: 4,
        },
      },
      output: {
        descriptions: {
          pl: "Polski opis.",
          en: "English description.",
          de: "Deutsche Beschreibung.",
          vi: "Mo ta tieng Viet.",
        },
        titleProposal: "Cotton T-shirt",
      },
      provider: "openai",
      model: "configured-model",
      pipelineVersion: "product-description-v2",
      generatedAt: "2026-08-02T12:00:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith(
      "finalize_product_draft_description_generation",
      expect.objectContaining({
        p_expected_seller_id: sellerId,
        p_attempt_token: uuid(3),
        p_expected_category_id: uuid(4),
        p_expected_facts_revision: 2,
        p_expected_cover_source: "private_draft",
        p_expected_cover_image_id: uuid(5),
        p_expected_cover_object_key: "drafts/cover.jpg",
      }),
    );
    expect(result).toMatchObject({
      result: "completed",
      descriptionSnapshot: {
        productDraftId,
        generationEligibility: { eligible: true, reason: null },
      },
      titleSnapshot: { title: "Cotton T-shirt", titleSource: "model" },
    });
  });

  it("records only a documented failure through the atomic function", async () => {
    const rpc = vi.fn(async () => ({ data: "failed", error: null }));
    const repository = repositoryWith(rpc);

    await expect(
      repository.fail({
        productDraftId,
        expectedSellerId: sellerId,
        attemptToken: uuid(3),
        errorCode: "product_description_generation_provider_failed",
      }),
    ).resolves.toBe("failed");
    expect(rpc).toHaveBeenCalledWith("fail_product_draft_description_generation", {
      p_product_draft_id: productDraftId,
      p_expected_seller_id: sellerId,
      p_attempt_token: uuid(3),
      p_error_code: "product_description_generation_provider_failed",
    });
  });
});

function repositoryWith(rpc: ReturnType<typeof vi.fn>) {
  return new SupabaseProductDraftDescriptionGenerationRepository({
    rpc,
  } as unknown as SupabaseClient<Database>);
}

function facts() {
  return {
    schemaVersion: 2 as const,
    colors: ["Blue"],
    materialComposition: "Cotton",
    uncertainFields: [],
    fieldSources: { colors: "human" as const, materialComposition: "human" as const },
  };
}

function descriptionSnapshot() {
  return {
    productDraftId,
    productStatus: "draft",
    categoryId: uuid(4),
    currentFactsRevision: 2,
    descriptions: ["pl", "en", "de", "vi"].map((language) => ({
      language,
      text: "Description.",
      source: language === "en" ? "human" : "model",
      factsRevision: 2,
      provider: language === "en" ? null : "openai",
      model: language === "en" ? null : "configured-model",
      pipelineVersion: language === "en" ? null : "product-description-v2",
      generatedAt: language === "en" ? null : "2026-08-02T12:00:00+00:00",
      updatedAt: "2026-08-02T12:00:00+00:00",
      outdated: false,
    })),
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
