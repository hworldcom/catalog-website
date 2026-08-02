import { describe, expect, it, vi } from "vitest";

import type { ProductDescriptionCoverImageGateway } from "./product-description-cover-image.gateway";
import { ProductDescriptionCoverImageError } from "./product-description-cover-image.gateway";
import type { ProductDescriptionGenerationProvider } from "./product-draft-description-generation.provider";
import { ProductDescriptionGenerationProviderError } from "./product-draft-description-generation.provider";
import type {
  ProductDescriptionGenerationClaim,
  ProductDescriptionGenerationRepository,
} from "./product-draft-description-generation.repository";
import { ProductDescriptionGenerationService } from "./product-draft-description-generation.service";
import { PRODUCT_DESCRIPTION_PIPELINE_VERSION } from "./product-draft-description-generation.types";

const productDraftId = uuid(1);
const sellerId = uuid(2);

describe("ProductDescriptionGenerationService", () => {
  it("claims, generates once, and atomically finalizes the output", async () => {
    const repository = repositoryWith();
    const provider = providerWith();
    const service = new ProductDescriptionGenerationService(
      repository,
      provider,
      coverGatewayWith(),
    );

    const result = await service.generate(productDraftId, sellerId);

    expect(provider.generate).toHaveBeenCalledOnce();
    expect(repository.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        productDraftId,
        expectedSellerId: sellerId,
        provider: "openai",
        model: "configured-model",
        pipelineVersion: PRODUCT_DESCRIPTION_PIPELINE_VERSION,
        output: {
          descriptions: validOutput().descriptions,
          titleProposal: "Cotton T-shirt",
        },
      }),
    );
    expect(repository.fail).not.toHaveBeenCalled();
    expect(result.titleSnapshot.title).toBe("Cotton T-shirt");
  });

  it("does not call the provider when no writable target exists", async () => {
    const repository = repositoryWith({ claimResult: { result: "no_writable_targets" } });
    const provider = providerWith();

    await expect(
      new ProductDescriptionGenerationService(repository, provider, coverGatewayWith()).generate(
        productDraftId,
        sellerId,
      ),
    ).rejects.toMatchObject({
      code: "product_description_generation_no_writable_targets",
      statusCode: 409,
    });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(repository.finalize).not.toHaveBeenCalled();
  });

  it("maps a defensive category-missing claim without calling the provider", async () => {
    const repository = repositoryWith({ claimResult: { result: "category_missing" } });
    const provider = providerWith();

    await expect(
      new ProductDescriptionGenerationService(repository, provider, coverGatewayWith()).generate(
        productDraftId,
        sellerId,
      ),
    ).rejects.toMatchObject({
      code: "product_description_generation_category_missing",
      statusCode: 409,
    });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("marks an owned provider timeout failed without finalizing output", async () => {
    const repository = repositoryWith();
    const provider = providerWith({
      error: new ProductDescriptionGenerationProviderError("timeout"),
    });

    await expect(
      new ProductDescriptionGenerationService(repository, provider, coverGatewayWith()).generate(
        productDraftId,
        sellerId,
      ),
    ).rejects.toMatchObject({
      code: "product_description_generation_provider_timeout",
      statusCode: 504,
    });
    expect(repository.fail).toHaveBeenCalledWith({
      productDraftId,
      expectedSellerId: sellerId,
      attemptToken: uuid(3),
      errorCode: "product_description_generation_provider_timeout",
    });
    expect(repository.finalize).not.toHaveBeenCalled();
  });

  it("returns superseded when a late failed attempt no longer owns the claim", async () => {
    const repository = repositoryWith({ failureResult: "superseded" });
    const provider = providerWith({
      error: new ProductDescriptionGenerationProviderError("failed"),
    });

    await expect(
      new ProductDescriptionGenerationService(repository, provider, coverGatewayWith()).generate(
        productDraftId,
        sellerId,
      ),
    ).rejects.toMatchObject({
      code: "product_description_generation_attempt_superseded",
      statusCode: 409,
    });
  });

  it("records malformed provider output as a terminal output failure", async () => {
    const repository = repositoryWith();
    const provider = providerWith({
      output: {
        ...validOutput(),
        descriptions: { ...validOutput().descriptions, en: "First.\nSecond." },
      },
    });

    await expect(
      new ProductDescriptionGenerationService(repository, provider, coverGatewayWith()).generate(
        productDraftId,
        sellerId,
      ),
    ).rejects.toMatchObject({
      code: "product_description_generation_output_invalid",
      statusCode: 502,
    });
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "product_description_generation_output_invalid" }),
    );
  });

  it("does not claim provider work when the ProductDraft has no selected cover", async () => {
    const repository = repositoryWith({ claimResult: { result: "cover_missing" } });
    const provider = providerWith();
    const coverGateway = coverGatewayWith();

    await expect(
      new ProductDescriptionGenerationService(repository, provider, coverGateway).generate(
        productDraftId,
        sellerId,
      ),
    ).rejects.toMatchObject({
      code: "product_description_generation_cover_missing",
      statusCode: 409,
    });
    expect(coverGateway.load).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("records an unsupported direct cover and does not call the provider", async () => {
    const repository = repositoryWith();
    const provider = providerWith();
    const coverGateway = coverGatewayWith({
      error: new ProductDescriptionCoverImageError("unsupported"),
    });

    await expect(
      new ProductDescriptionGenerationService(repository, provider, coverGateway).generate(
        productDraftId,
        sellerId,
      ),
    ).rejects.toMatchObject({
      code: "product_description_generation_cover_unsupported",
      statusCode: 409,
    });
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "product_description_generation_cover_unsupported",
      }),
    );
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("records an unavailable selected cover and does not call the provider", async () => {
    const repository = repositoryWith();
    const provider = providerWith();
    const coverGateway = coverGatewayWith({
      error: new ProductDescriptionCoverImageError("unavailable"),
    });

    await expect(
      new ProductDescriptionGenerationService(repository, provider, coverGateway).generate(
        productDraftId,
        sellerId,
      ),
    ).rejects.toMatchObject({
      code: "product_description_generation_cover_unavailable",
      statusCode: 503,
    });
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "product_description_generation_cover_unavailable",
      }),
    );
    expect(repository.finalize).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("records a provider-declared unusable cover without finalizing prose", async () => {
    const repository = repositoryWith();
    const provider = providerWith({
      output: {
        imageAssessment: { usable: false, observedDetails: [] },
        descriptions: null,
        titleProposal: null,
      },
    });

    await expect(
      new ProductDescriptionGenerationService(repository, provider, coverGatewayWith()).generate(
        productDraftId,
        sellerId,
      ),
    ).rejects.toMatchObject({
      code: "product_description_generation_image_not_usable",
      statusCode: 422,
    });
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "product_description_generation_image_not_usable",
      }),
    );
    expect(repository.finalize).not.toHaveBeenCalled();
  });
});

function repositoryWith(options?: {
  claimResult?: Awaited<ReturnType<ProductDescriptionGenerationRepository["claim"]>>;
  failureResult?: Awaited<ReturnType<ProductDescriptionGenerationRepository["fail"]>>;
}): ProductDescriptionGenerationRepository & {
  claim: ReturnType<typeof vi.fn>;
  finalize: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
} {
  return {
    claim: vi.fn(async () => options?.claimResult ?? claim()),
    finalize: vi.fn(async () => ({
      result: "completed" as const,
      descriptionSnapshot: descriptionSnapshot(),
      titleSnapshot: titleSnapshot(),
    })),
    fail: vi.fn(async () => options?.failureResult ?? "failed"),
  };
}

function providerWith(options?: {
  error?: Error;
  output?:
    | ReturnType<typeof validOutput>
    | {
        imageAssessment: { usable: false; observedDetails: [] };
        descriptions: null;
        titleProposal: null;
      };
}): ProductDescriptionGenerationProvider & { generate: ReturnType<typeof vi.fn> } {
  return {
    generate: vi.fn(async () => {
      if (options?.error) throw options.error;
      return {
        output: options?.output ?? validOutput(),
        provider: "openai",
        model: "configured-model",
        responseId: "resp_1",
      };
    }),
  };
}

function claim(): ProductDescriptionGenerationClaim {
  return {
    result: "claimed",
    attemptToken: uuid(3),
    category: { id: uuid(4), slug: "t-shirts", name: "T-shirts" },
    factsRevision: 2,
    facts: {
      schemaVersion: 2,
      colors: ["Blue"],
      materialComposition: "Cotton",
      uncertainFields: [],
      fieldSources: { colors: "human", materialComposition: "human" },
    },
    humanLanguages: [],
    titleBlank: true,
    cover: {
      source: "public_product_upload",
      imageUrl:
        "https://example.supabase.co/storage/v1/object/public/product-images/user/products/cover.jpg",
    },
  };
}

function validOutput(titleProposal: string | null = "Cotton T-shirt") {
  return {
    imageAssessment: {
      usable: true,
      observedDetails: ["Blue short-sleeve top"],
    },
    descriptions: {
      pl: "Polski opis.",
      en: "English description.",
      de: "Deutsche Beschreibung.",
      vi: "Mo ta tieng Viet.",
    },
    titleProposal,
  };
}

function coverGatewayWith(options?: {
  error?: Error;
}): ProductDescriptionCoverImageGateway & { load: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn(async () => {
      if (options?.error) throw options.error;
      return {
        mediaType: "image/jpeg" as const,
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      };
    }),
  };
}

function descriptionSnapshot() {
  return {
    productDraftId,
    productStatus: "draft" as const,
    currentFactsRevision: 2,
    generationEligibility: { eligible: true, reason: null },
    descriptions: ["pl", "en", "de", "vi"].map((language) => ({
      language: language as "pl" | "en" | "de" | "vi",
      text: "Description.",
      source: "model" as const,
      factsRevision: 2,
      provider: "openai",
      model: "configured-model",
      pipelineVersion: PRODUCT_DESCRIPTION_PIPELINE_VERSION,
      generatedAt: "2026-08-02T12:00:00.000Z",
      updatedAt: "2026-08-02T12:00:00.000Z",
      outdated: false,
    })),
  };
}

function titleSnapshot() {
  return {
    productDraftId,
    title: "Cotton T-shirt",
    titleSource: "model" as const,
    productStatus: "draft" as const,
    editable: true,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
