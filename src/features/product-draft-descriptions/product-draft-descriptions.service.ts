import type {
  ProductDraftDescriptionPatch,
  ProductDraftDescriptionSnapshot,
} from "./product-draft-descriptions.types";
import { ProductDraftDescriptionError } from "./product-draft-descriptions.types";
import type { ProductDraftDescriptionRepository } from "./product-draft-descriptions.repository";
import {
  expectedProductDraftSellerId,
  type ProductDraftAccess,
} from "@/features/product-draft-access";

export class ProductDraftDescriptionService {
  constructor(private readonly repository: ProductDraftDescriptionRepository) {}

  async get(
    productDraftId: string,
    access: ProductDraftAccess,
  ): Promise<ProductDraftDescriptionSnapshot> {
    try {
      const record = await this.repository.get(
        productDraftId,
        expectedProductDraftSellerId(access),
      );
      if (!record) throw productDraftNotFound();
      if (record.currentFactsRevision === null) throw productDraftFactsMissing();
      return snapshot(record);
    } catch (error) {
      throw unavailable(error);
    }
  }

  async update(
    productDraftId: string,
    patch: ProductDraftDescriptionPatch,
    access: ProductDraftAccess,
  ): Promise<ProductDraftDescriptionSnapshot> {
    try {
      const result = await this.repository.applyPatch(
        productDraftId,
        patch,
        expectedProductDraftSellerId(access),
      );
      if (result.result === "applied") {
        return snapshot(result.snapshot);
      }
      if (result.result === "not_found") throw productDraftNotFound();
      if (result.result === "facts_missing") throw productDraftFactsMissing();
      if (result.result === "not_editable") {
        throw new ProductDraftDescriptionError(
          409,
          "product_draft_description_not_editable",
          "ProductDraft descriptions can only be changed while the product is a draft.",
        );
      }
      throw new Error("ProductDraft description patch returned an invalid result.");
    } catch (error) {
      throw unavailable(error);
    }
  }
}

function snapshot(
  record: NonNullable<Awaited<ReturnType<ProductDraftDescriptionRepository["get"]>>>,
): ProductDraftDescriptionSnapshot {
  if (record.currentFactsRevision === null) throw productDraftFactsMissing();

  const generationEligibility =
    record.productStatus !== "draft"
      ? { eligible: false, reason: "product_not_draft" as const }
      : record.categoryId
        ? { eligible: true, reason: null }
        : { eligible: false, reason: "category_missing" as const };

  return {
    productDraftId: record.productDraftId,
    productStatus: record.productStatus,
    currentFactsRevision: record.currentFactsRevision,
    generationEligibility,
    descriptions: record.descriptions,
  };
}

function productDraftNotFound(): ProductDraftDescriptionError {
  return new ProductDraftDescriptionError(
    404,
    "product_draft_not_found",
    "The ProductDraft was not found.",
  );
}

function productDraftFactsMissing(): ProductDraftDescriptionError {
  return new ProductDraftDescriptionError(
    500,
    "product_draft_facts_missing",
    "The ProductDraft facts record is missing.",
  );
}

function unavailable(error: unknown): ProductDraftDescriptionError {
  if (error instanceof ProductDraftDescriptionError) return error;

  console.error("[ProductDraft descriptions] Persistence operation failed.", error);
  return new ProductDraftDescriptionError(
    500,
    "product_draft_description_unavailable",
    "ProductDraft descriptions are temporarily unavailable.",
  );
}
