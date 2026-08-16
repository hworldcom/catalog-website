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
      workingCopy: false,
      moderationRevision: 4,
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

  it("claims a published product through its private working-copy revision", async () => {
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
          human_languages: [],
          title_blank: false,
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
    const repository = repositoryWith(rpc, { workingCopy: true, productStatus: "published" });

    await expect(repository.claim(productDraftId, sellerId)).resolves.toMatchObject({
      result: "claimed",
      workingCopy: true,
      moderationRevision: 4,
    });
    expect(rpc).toHaveBeenCalledWith("claim_product_moderation_working_description_generation", {
      p_product_id: productDraftId,
      p_seller_id: sellerId,
      p_expected_revision: 4,
    });
  });

  it("accepts an atomic claim with explicit null category metadata", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "claimed",
          attempt_token: uuid(3),
          category_id: null,
          category_slug: null,
          category_name: null,
          facts_revision: 2,
          facts_json: facts(),
          human_languages: [],
          title_blank: true,
          cover_source: "public_product_upload",
          cover_image_id: null,
          cover_image_url:
            "https://example.supabase.co/storage/v1/object/public/product-images/cover.jpg",
          cover_storage_bucket: null,
          cover_object_key: null,
          cover_content_type: null,
          cover_size_bytes: null,
        },
      ],
      error: null,
    }));

    await expect(repositoryWith(rpc).claim(productDraftId, sellerId)).resolves.toMatchObject({
      result: "claimed",
      category: null,
      titleBlank: true,
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
            moderationRevision: 4,
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
      pipelineVersion: "product-description-v3",
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

  it("passes a null category fence to finalization", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ result: "input_changed", description_snapshot: null, title_snapshot: null }],
      error: null,
    }));
    const repository = repositoryWith(rpc);

    await repository.finalize({
      productDraftId,
      expectedSellerId: sellerId,
      claim: {
        result: "claimed",
        attemptToken: uuid(3),
        category: null,
        factsRevision: 2,
        facts: facts(),
        humanLanguages: [],
        titleBlank: true,
        cover: {
          source: "public_product_upload",
          imageUrl: "https://example.supabase.co/storage/v1/object/public/product-images/cover.jpg",
        },
      },
      output: {
        descriptions: {
          pl: "Polski opis.",
          en: "English description.",
          de: "Deutsche Beschreibung.",
          vi: "Mo ta tieng Viet.",
        },
        titleProposal: null,
      },
      provider: "openai",
      model: "configured-model",
      pipelineVersion: "product-description-v3",
      generatedAt: "2026-08-08T12:00:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith(
      "finalize_product_draft_description_generation",
      expect.objectContaining({ p_expected_category_id: null }),
    );
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

function repositoryWith(
  rpc: ReturnType<typeof vi.fn>,
  options: {
    workingCopy?: boolean;
    productStatus?: "draft" | "published" | "archived";
  } = {},
) {
  const databaseRpc = vi.fn(async (operation: string, parameters: unknown) => {
    if (operation === "read_product_moderation_edit_state") {
      return {
        data: [editState(options)],
        error: null,
      };
    }
    return rpc(operation, parameters);
  });
  return new SupabaseProductDraftDescriptionGenerationRepository({
    rpc: databaseRpc,
  } as unknown as SupabaseClient<Database>);
}

function editState(options: {
  workingCopy?: boolean;
  productStatus?: "draft" | "published" | "archived";
}) {
  return {
    product_id: productDraftId,
    seller_id: sellerId,
    product_status: options.productStatus ?? "draft",
    revision: 4,
    editable: true,
    working_copy: options.workingCopy ?? false,
    snapshot_json: {
      schemaVersion: 1,
      productId: productDraftId,
      sellerId,
      productCode: "SEL-F-TSH-0001",
      productCodeInput: null,
      title: "Cotton T-shirt",
      titleSource: "human",
      categoryId: uuid(4),
      audiences: ["women"],
      descriptions: [],
      facts: { factsRevision: 2, facts: facts() },
      minimumOrder: null,
      packSize: null,
      price: null,
      currency: "EUR",
      stock: "made_to_order",
      imageIds: [uuid(5)],
      coverImageId: uuid(5),
    },
  };
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
    moderationRevision: 4,
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
      pipelineVersion: language === "en" ? null : "product-description-v3",
      generatedAt: language === "en" ? null : "2026-08-02T12:00:00+00:00",
      updatedAt: "2026-08-02T12:00:00+00:00",
      outdated: false,
    })),
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
