import type {
  HumanProductDraftTitleWrite,
  ProductDraftTitleCreateResult,
  ProductDraftTitleRepository,
  ProductDraftTitleUpdateResult,
  SellerProductFields,
} from "./product-draft-title.repository";
import {
  expectedProductDraftSellerId,
  type ProductDraftAccess,
} from "@/features/product-draft-access";
import {
  invalidProductDraftTitle,
  normalizeProductDraftTitle,
  ProductDraftTitleError,
  requiredProductDraftTitle,
  type ProductDraftTitleSnapshot,
} from "./product-draft-title.types";

export type ProductDraftTitleAccess = ProductDraftAccess;

export type SellerProductSave = {
  productDraftId?: string;
  sellerId: string;
  title?: string;
  productFields: SellerProductFields;
};

export class ProductDraftTitleService {
  constructor(private readonly repository: ProductDraftTitleRepository) {}

  async get(
    productDraftId: string,
    access: ProductDraftTitleAccess,
  ): Promise<ProductDraftTitleSnapshot> {
    const result = await this.repository.get(productDraftId, expectedProductDraftSellerId(access));
    if (!result) throw productDraftNotFound();
    return snapshot(result);
  }

  async update(
    productDraftId: string,
    title: string,
    access: ProductDraftTitleAccess,
  ): Promise<ProductDraftTitleSnapshot> {
    const result = await this.repository.updateTitle(
      productDraftId,
      expectedProductDraftSellerId(access),
      humanTitleWrite(title),
    );
    return updateSnapshot(result);
  }

  async saveSellerProduct(input: SellerProductSave): Promise<ProductDraftTitleSnapshot> {
    const titleWrite = input.title === undefined ? null : humanTitleWrite(input.title);
    rejectBlankPublication(titleWrite, input.productFields.status);

    if (!input.productDraftId) {
      if (input.productFields.status === "published" && !titleWrite) {
        throw requiredProductDraftTitle();
      }
      return createSnapshot(
        await this.repository.create(input.sellerId, titleWrite, input.productFields),
      );
    }

    return updateSnapshot(
      await this.repository.update(
        input.productDraftId,
        input.sellerId,
        titleWrite,
        input.productFields,
      ),
    );
  }
}

function humanTitleWrite(title: string): HumanProductDraftTitleWrite {
  const normalized = normalizeProductDraftTitle(title);
  return {
    title: normalized,
    titleSource: normalized ? "human" : null,
  };
}

function rejectBlankPublication(
  titleWrite: HumanProductDraftTitleWrite | null,
  status: SellerProductFields["status"],
) {
  if (status === "published" && titleWrite?.title === "") {
    throw requiredProductDraftTitle();
  }
}

function snapshot(record: {
  productDraftId: string;
  title: string;
  titleSource: "human" | "model" | null;
  productStatus: "draft" | "published" | "archived";
}): ProductDraftTitleSnapshot {
  return {
    ...record,
    editable: record.productStatus === "draft",
  };
}

function updateSnapshot(result: ProductDraftTitleUpdateResult): ProductDraftTitleSnapshot {
  if (result.result === "updated") return snapshot(result);
  if (result.result === "not_found") throw productDraftNotFound();
  if (result.result === "product_audience_product_not_found") {
    throw new ProductDraftTitleError(404, result.result, "The product was not found.");
  }
  if (result.result === "not_editable") {
    throw new ProductDraftTitleError(
      409,
      "product_draft_title_not_editable",
      "The ProductDraft title can only be changed while the product is a draft.",
    );
  }
  if (result.result === "title_required") throw requiredProductDraftTitle();
  if (result.result === "title_invalid") throw invalidProductDraftTitle();
  if (result.result === "product_audience_invalid") {
    throw new ProductDraftTitleError(
      400,
      result.result,
      "The selected product audience is invalid.",
    );
  }
  if (result.result === "product_audience_moderation_required") {
    throw new ProductDraftTitleError(
      409,
      result.result,
      "Published product audiences must be changed through moderation.",
    );
  }
  if (result.result === "product_publication_audience_required") {
    throw new ProductDraftTitleError(
      409,
      result.result,
      "Select at least one audience before publishing the product.",
    );
  }
  if (result.result === "product_publication_category_required") {
    throw new ProductDraftTitleError(
      409,
      result.result,
      "Select a supported product category before publishing the product.",
    );
  }
  if (result.result === "product_category_not_supported") {
    throw new ProductDraftTitleError(
      400,
      result.result,
      "The selected product category is not supported.",
    );
  }
  if (result.result === "product_code_company_unconfigured") {
    throw new ProductDraftTitleError(
      409,
      result.result,
      "Configure the seller company code before publishing a product.",
    );
  }
  if (result.result === "product_code_category_unconfigured") {
    throw new ProductDraftTitleError(
      500,
      result.result,
      "The selected category has no product-code configuration.",
    );
  }
  if (result.result === "product_code_allocation_failed") {
    throw new ProductDraftTitleError(
      503,
      result.result,
      "A product code could not be allocated. Retry publication.",
    );
  }
  throw invalidProductDraftTitle();
}

function createSnapshot(result: ProductDraftTitleCreateResult): ProductDraftTitleSnapshot {
  if (result.result === "created") return snapshot(result);
  if (result.result === "product_audience_product_not_found") {
    throw new ProductDraftTitleError(404, result.result, "The product was not found.");
  }
  if (result.result === "title_required") throw requiredProductDraftTitle();
  if (result.result === "title_invalid") throw invalidProductDraftTitle();
  if (result.result === "product_audience_invalid") {
    throw new ProductDraftTitleError(
      400,
      result.result,
      "The selected product audience is invalid.",
    );
  }
  if (result.result === "product_publication_audience_required") {
    throw new ProductDraftTitleError(
      409,
      result.result,
      "Select at least one audience before publishing the product.",
    );
  }
  if (result.result === "product_category_required") {
    throw new ProductDraftTitleError(
      400,
      result.result,
      "Select a supported product category before creating the product.",
    );
  }
  if (result.result === "product_publication_category_required") {
    throw new ProductDraftTitleError(
      409,
      result.result,
      "Select a supported product category before publishing the product.",
    );
  }
  if (result.result === "product_category_not_supported") {
    throw new ProductDraftTitleError(
      400,
      result.result,
      "The selected product category is not supported.",
    );
  }
  if (result.result === "product_code_company_unconfigured") {
    throw new ProductDraftTitleError(
      409,
      result.result,
      "Configure the seller company code before creating a product.",
    );
  }
  if (result.result === "product_code_category_unconfigured") {
    throw new ProductDraftTitleError(
      500,
      result.result,
      "The selected category has no product-code configuration.",
    );
  }
  if (result.result === "product_code_allocation_failed") {
    throw new ProductDraftTitleError(
      503,
      result.result,
      "A product code could not be allocated. Retry the request.",
    );
  }
  throw invalidProductDraftTitle();
}

function productDraftNotFound(): ProductDraftTitleError {
  return new ProductDraftTitleError(
    404,
    "product_draft_not_found",
    "The ProductDraft was not found.",
  );
}
