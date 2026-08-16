import type {
  ProductDraftFactsPatch,
  ProductDraftFactsSnapshot,
} from "./product-draft-facts.types";
import { ProductDraftFactsError } from "./product-draft-facts.types";
import type { ProductDraftFactsRepository } from "./product-draft-facts.repository";
import {
  expectedProductDraftSellerId,
  type ProductDraftAccess,
} from "@/features/product-draft-access";

export type ProductDraftFactsAccess = ProductDraftAccess;

export class ProductDraftFactsService {
  constructor(private readonly repository: ProductDraftFactsRepository) {}

  async get(
    productDraftId: string,
    access: ProductDraftFactsAccess,
  ): Promise<ProductDraftFactsSnapshot> {
    const result = await this.repository.get(productDraftId, expectedProductDraftSellerId(access));
    if (!result) throw productDraftNotFound();
    if (!result.factsRecord) throw productDraftFactsMissing();

    return {
      productDraftId: result.productDraftId,
      moderationRevision: result.moderationRevision,
      facts: result.factsRecord.facts,
      factsRevision: result.factsRecord.factsRevision,
      updatedAt: result.factsRecord.updatedAt,
      productStatus: result.productStatus,
      editable: result.editable ?? result.productStatus === "draft",
    };
  }

  async update(
    productDraftId: string,
    patch: ProductDraftFactsPatch,
    expectedModerationRevision: number,
    access: ProductDraftFactsAccess,
  ): Promise<ProductDraftFactsSnapshot> {
    const result = await this.repository.applyPatch(
      productDraftId,
      patch,
      expectedProductDraftSellerId(access),
      expectedModerationRevision,
    );

    if (result.result === "not_found") throw productDraftNotFound();
    if (result.result === "facts_missing") throw productDraftFactsMissing();
    if (result.result === "not_editable") {
      throw new ProductDraftFactsError(
        409,
        "product_draft_facts_not_editable",
        "ProductDraft facts can only be changed while the product is a draft.",
      );
    }

    return {
      productDraftId: result.productDraftId,
      moderationRevision: result.moderationRevision,
      facts: result.facts,
      factsRevision: result.factsRevision,
      updatedAt: result.updatedAt,
      productStatus: result.productStatus,
      editable: true,
    };
  }
}

function productDraftNotFound(): ProductDraftFactsError {
  return new ProductDraftFactsError(
    404,
    "product_draft_not_found",
    "The ProductDraft was not found.",
  );
}

function productDraftFactsMissing(): ProductDraftFactsError {
  return new ProductDraftFactsError(
    500,
    "product_draft_facts_missing",
    "The ProductDraft facts record is missing.",
  );
}
