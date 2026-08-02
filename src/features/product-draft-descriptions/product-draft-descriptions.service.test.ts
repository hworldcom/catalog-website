import { describe, expect, it } from "vitest";

import type {
  ProductDraftDescriptionPatchResult,
  ProductDraftDescriptionRecord,
  ProductDraftDescriptionRepository,
} from "./product-draft-descriptions.repository";
import { ProductDraftDescriptionService } from "./product-draft-descriptions.service";

const productDraftId = "00000000-0000-4000-8000-000000000001";
const access = { mode: "prototype_administrator" } as const;

class MemoryRepository implements ProductDraftDescriptionRepository {
  expectedSellerId: string | null | undefined;
  record: ProductDraftDescriptionRecord = descriptionRecord();
  patchResult: ProductDraftDescriptionPatchResult = {
    result: "applied",
    snapshot: descriptionRecord()!,
  };

  async get(_productDraftId: string, expectedSellerId: string | null) {
    this.expectedSellerId = expectedSellerId;
    return this.record;
  }

  async applyPatch(
    _productDraftId: string,
    _patch: Parameters<ProductDraftDescriptionRepository["applyPatch"]>[1],
    expectedSellerId: string | null,
  ) {
    this.expectedSellerId = expectedSellerId;
    return this.patchResult;
  }
}

describe("ProductDraftDescriptionService", () => {
  it("returns content eligibility and all language entries", async () => {
    const service = new ProductDraftDescriptionService(new MemoryRepository());

    await expect(service.get(productDraftId, access)).resolves.toMatchObject({
      productDraftId,
      currentFactsRevision: 4,
      generationEligibility: { eligible: true, reason: null },
      descriptions: [
        { language: "pl", text: null },
        { language: "en", text: "English description", source: "human" },
        { language: "de", text: null },
        { language: "vi", text: null },
      ],
    });
  });

  it("maps terminal persistence outcomes to stable errors", async () => {
    const repository = new MemoryRepository();
    const service = new ProductDraftDescriptionService(repository);

    repository.patchResult = { result: "not_editable" };
    await expect(service.update(productDraftId, { en: "Updated" }, access)).rejects.toMatchObject({
      statusCode: 409,
      code: "product_draft_description_not_editable",
    });

    repository.patchResult = { result: "facts_missing" };
    await expect(service.update(productDraftId, { en: "Updated" }, access)).rejects.toMatchObject({
      statusCode: 500,
      code: "product_draft_facts_missing",
    });
  });

  it("maps unexpected persistence failures to the stable unavailable error", async () => {
    const repository = new MemoryRepository();
    repository.get = async () => {
      throw new Error("database connection reset");
    };
    const service = new ProductDraftDescriptionService(repository);

    await expect(service.get(productDraftId, access)).rejects.toMatchObject({
      statusCode: 500,
      code: "product_draft_description_unavailable",
    });
  });

  it("scopes seller reads and edits to the expected seller", async () => {
    const repository = new MemoryRepository();
    const service = new ProductDraftDescriptionService(repository);
    const sellerAccess = { mode: "seller", expectedSellerId: uuid(2) } as const;

    await service.get(productDraftId, sellerAccess);
    expect(repository.expectedSellerId).toBe(uuid(2));

    await service.update(productDraftId, { en: "Updated" }, sellerAccess);
    expect(repository.expectedSellerId).toBe(uuid(2));
  });
});

function descriptionRecord(): Exclude<ProductDraftDescriptionRecord, null> {
  return {
    productDraftId,
    productStatus: "draft",
    categoryId: "00000000-0000-4000-8000-000000000002",
    currentFactsRevision: 4,
    descriptions: [
      missing("pl"),
      {
        language: "en",
        text: "English description",
        source: "human",
        factsRevision: 4,
        provider: null,
        model: null,
        pipelineVersion: null,
        generatedAt: null,
        updatedAt: "2026-07-25T12:00:00+00:00",
        outdated: false,
      },
      missing("de"),
      missing("vi"),
    ],
  };
}

function missing(language: "pl" | "de" | "vi") {
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
  } as const;
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
