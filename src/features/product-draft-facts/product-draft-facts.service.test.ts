import { describe, expect, it } from "vitest";

import type {
  ProductDraftFactsPatchResult,
  ProductDraftFactsReadResult,
  ProductDraftFactsRepository,
} from "./product-draft-facts.repository";
import {
  ProductDraftFactsService,
  type ProductDraftFactsAccess,
} from "./product-draft-facts.service";
import type { ProductDraftFacts, ProductDraftFactsPatch } from "./product-draft-facts.types";

const productDraftId = "00000000-0000-0000-0000-000000000001";
const sellerId = "00000000-0000-0000-0000-000000000002";
const updatedAt = "2026-07-24T12:00:00Z";

const canonicalFacts: ProductDraftFacts = {
  schemaVersion: 2,
  colors: [],
  materialComposition: null,
  uncertainFields: [],
  fieldSources: {
    colors: null,
    materialComposition: null,
  },
};

const ownerAccess: ProductDraftFactsAccess = {
  mode: "seller",
  expectedSellerId: sellerId,
};

class FactsRepository implements ProductDraftFactsRepository {
  expectedSellerIds: (string | null)[] = [];
  readResult: ProductDraftFactsReadResult = {
    productDraftId,
    productStatus: "draft",
    factsRecord: {
      productDraftId,
      facts: canonicalFacts,
      factsRevision: 1,
      updatedAt,
    },
  };
  patchResult: ProductDraftFactsPatchResult = {
    result: "updated",
    productDraftId,
    facts: {
      ...canonicalFacts,
      materialComposition: "cotton",
      fieldSources: { ...canonicalFacts.fieldSources, materialComposition: "human" },
    },
    factsRevision: 2,
    updatedAt,
    productStatus: "draft",
  };

  async get(_productDraftId: string, expectedSellerId: string | null) {
    this.expectedSellerIds.push(expectedSellerId);
    return this.readResult;
  }

  async applyPatch(
    _productDraftId: string,
    _patch: ProductDraftFactsPatch,
    expectedSellerId: string | null,
  ) {
    this.expectedSellerIds.push(expectedSellerId);
    return this.patchResult;
  }
}

describe("ProductDraftFactsService", () => {
  it("returns an owning seller's complete editable snapshot", async () => {
    const repository = new FactsRepository();
    const service = new ProductDraftFactsService(repository);

    await expect(service.get(productDraftId, ownerAccess)).resolves.toEqual({
      productDraftId,
      facts: canonicalFacts,
      factsRevision: 1,
      updatedAt,
      productStatus: "draft",
      editable: true,
    });
    expect(repository.expectedSellerIds).toEqual([sellerId]);
  });

  it("lets an allowlisted prototype administrator bypass only seller ownership", async () => {
    const repository = new FactsRepository();
    repository.readResult = {
      ...repository.readResult!,
      productStatus: "published",
    };
    const service = new ProductDraftFactsService(repository);

    await expect(
      service.get(productDraftId, {
        mode: "prototype_administrator",
      }),
    ).resolves.toMatchObject({
      productStatus: "published",
      editable: false,
    });
    expect(repository.expectedSellerIds).toEqual([null]);
  });

  it("enforces the delegated administrator's immutable seller", async () => {
    const repository = new FactsRepository();
    repository.readResult = null;
    const service = new ProductDraftFactsService(repository);

    await expect(
      service.get(productDraftId, {
        mode: "delegated_administrator",
        expectedSellerId: sellerId,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "product_draft_not_found",
    });
    expect(repository.expectedSellerIds).toEqual([sellerId]);
  });

  it("maps foreign or missing products to the same not-found error", async () => {
    const repository = new FactsRepository();
    repository.readResult = null;
    const service = new ProductDraftFactsService(repository);

    await expect(service.get(productDraftId, ownerAccess)).rejects.toMatchObject({
      statusCode: 404,
      code: "product_draft_not_found",
    });
  });

  it("reports a missing facts row as an invariant failure", async () => {
    const repository = new FactsRepository();
    repository.readResult = {
      productDraftId,
      productStatus: "draft",
      factsRecord: null,
    };
    const service = new ProductDraftFactsService(repository);

    await expect(service.get(productDraftId, ownerAccess)).rejects.toMatchObject({
      statusCode: 500,
      code: "product_draft_facts_missing",
    });
  });

  it("returns the complete database snapshot after a partial update", async () => {
    const repository = new FactsRepository();
    const service = new ProductDraftFactsService(repository);

    await expect(
      service.update(productDraftId, { materialComposition: "cotton" }, ownerAccess),
    ).resolves.toEqual({
      productDraftId,
      facts: repository.patchResult.result === "updated" ? repository.patchResult.facts : null,
      factsRevision: 2,
      updatedAt,
      productStatus: "draft",
      editable: true,
    });
    expect(repository.expectedSellerIds).toEqual([sellerId]);
  });

  it("preserves a no-op update snapshot", async () => {
    const repository = new FactsRepository();
    repository.patchResult = {
      result: "unchanged",
      productDraftId,
      facts: canonicalFacts,
      factsRevision: 3,
      updatedAt,
      productStatus: "draft",
    };
    const service = new ProductDraftFactsService(repository);

    await expect(
      service.update(productDraftId, { colors: [] }, ownerAccess),
    ).resolves.toMatchObject({
      factsRevision: 3,
      facts: canonicalFacts,
    });
  });

  it.each<
    [
      ProductDraftFactsPatchResult,
      {
        statusCode: number;
        code: string;
      },
    ]
  >([
    [{ result: "not_found" }, { statusCode: 404, code: "product_draft_not_found" }],
    [{ result: "facts_missing" }, { statusCode: 500, code: "product_draft_facts_missing" }],
    [
      {
        result: "not_editable",
        productDraftId,
        productStatus: "archived",
      },
      { statusCode: 409, code: "product_draft_facts_not_editable" },
    ],
  ])("maps patch result $result to a stable error", async (patchResult, expectedError) => {
    const repository = new FactsRepository();
    repository.patchResult = patchResult;
    const service = new ProductDraftFactsService(repository);

    await expect(
      service.update(productDraftId, { materialComposition: null }, ownerAccess),
    ).rejects.toMatchObject(expectedError);
  });
});
