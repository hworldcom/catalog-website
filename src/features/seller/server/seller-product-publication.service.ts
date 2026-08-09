import {
  ProductDraftTitleError,
  PRODUCT_DRAFT_TITLE_MAX_LENGTH,
  type ProductDraftTitleSnapshot,
} from "@/features/product-draft-title/product-draft-title.types";

import {
  SellerProductPublicationError,
  type SellerProductPublicationSnapshot,
} from "../seller-product-publication.types";
import type { SellerProductPublicationInput } from "../seller-product-write.types";
import type { ProductPublicationService } from "./product-publication.service";
import type { ProductPublicationCorrelation } from "./product-publication.types";
import type { SellerProductPublicationRepository } from "./seller-product-publication.repository";

type DirectProductPublisher = (input: {
  sellerId: string;
  product: SellerProductPublicationInput;
}) => Promise<ProductDraftTitleSnapshot>;

export class SellerProductPublicationService {
  constructor(
    private readonly products: SellerProductPublicationRepository,
    private readonly publications: Pick<ProductPublicationService, "authorize" | "get" | "retry">,
    private readonly publishDirectProduct: DirectProductPublisher,
  ) {}

  async publish(
    sellerId: string,
    input: SellerProductPublicationInput,
    delegatedAction: ProductPublicationCorrelation | null = null,
  ): Promise<SellerProductPublicationSnapshot> {
    const product = await this.requireOwnedProduct(input.id, sellerId);
    if (!input.category_id) throw publicationCategoryRequired();
    if (product.imagePublicationMode === "direct") {
      requirePublicationTitle("title" in input ? input.title : product.title);
      const cover =
        "cover_image_url" in input
          ? normalizeOptional(input.cover_image_url)
          : product.coverImageUrl;
      if (!cover) throw publicationImageRequired();

      let saved: ProductDraftTitleSnapshot;
      try {
        saved = await this.publishDirectProduct({ sellerId, product: input });
      } catch (error) {
        if (error instanceof ProductDraftTitleError) {
          if (error.code === "product_draft_title_required") throw publicationTitleRequired();
          if (error.code === "product_draft_title_invalid") throw publicationTitleInvalid();
          if (error.code === "product_publication_category_required") {
            throw publicationCategoryRequired();
          }
          if (error.code === "product_category_not_supported") {
            throw publicationInvalid();
          }
          if (
            error.code === "product_code_company_unconfigured" ||
            error.code === "product_code_category_unconfigured"
          ) {
            throw publicationConfigurationInvalid();
          }
          if (error.code === "product_code_allocation_failed") throw publicationUnavailable();
        }
        throw error;
      }
      return directSnapshot(saved.productDraftId, saved.productStatus);
    }

    const result = await this.publications.authorize({
      productDraftId: input.id,
      sellerId,
      titlePatchPresent: "title" in input,
      title: input.title ?? null,
      descriptionPatchPresent: "description" in input,
      description: input.description ?? null,
      categoryId: input.category_id ?? null,
      moq: input.moq ?? null,
      packSize: normalizeOptional(input.pack_size),
      price: input.price ?? null,
      currency: input.currency,
      stock: input.stock,
      coverImageUrlPatchPresent: "cover_image_url" in input,
      coverImageUrl: normalizeOptional(input.cover_image_url),
      trending: input.trending,
      delegatedAction,
    });

    if (result.result === "in_progress") {
      throw new SellerProductPublicationError(
        409,
        "product_publication_in_progress",
        "Another product publication is already running. Submitted changes were not saved.",
      );
    }
    if (result.result === "dispatch_failed") throw publicationUnavailable();
    if (result.result !== "pending") throw authorizationError(result.result);

    return this.requireSnapshot(input.id, sellerId);
  }

  async get(productDraftId: string, sellerId: string): Promise<SellerProductPublicationSnapshot> {
    const product = await this.requireOwnedProduct(productDraftId, sellerId);
    if (product.imagePublicationMode === "direct") {
      return directSnapshot(product.productDraftId, product.productStatus);
    }

    const run = await this.publications.get(productDraftId);
    if (!run) return durableNotStarted(product.productDraftId, product.productStatus);
    if (run.sellerId !== sellerId) throw publicationUnavailable();

    const currentProduct =
      run.status === "completed"
        ? await this.requireOwnedProduct(productDraftId, sellerId)
        : product;
    return {
      productDraftId,
      productStatus: currentProduct.productStatus,
      publicationStatus: run.status,
      attemptCount: run.attemptCount,
      failureReasonCode: run.failureReasonCode,
      retryAllowed: run.retryAllowed,
      publicProductUrl:
        currentProduct.productStatus === "published" ? `/p/${productDraftId}` : null,
    };
  }

  async retry(
    productDraftId: string,
    sellerId: string,
    delegatedAction: ProductPublicationCorrelation | null = null,
  ): Promise<SellerProductPublicationSnapshot> {
    const product = await this.requireOwnedProduct(productDraftId, sellerId);
    if (product.imagePublicationMode !== "durable") {
      throw publicationNotAllowed();
    }
    if (!product.categoryId) throw publicationCategoryRequired();

    const result = delegatedAction
      ? await this.publications.retry(productDraftId, sellerId, delegatedAction)
      : await this.publications.retry(productDraftId, sellerId);
    if (typeof result === "object" && result.result === "dispatch_failed") {
      throw publicationUnavailable();
    }
    if (result === "not_found") throw productNotFound();
    if (result === "not_allowed") throw publicationNotAllowed();
    if (result === "title_required") throw publicationTitleRequired();
    if (result === "title_invalid") throw publicationTitleInvalid();
    if (result === "description_invalid") throw publicationDescriptionInvalid();
    if (result === "category_required") throw publicationCategoryRequired();
    if (result === "in_progress") throw publicationInProgress();

    return this.requireSnapshot(productDraftId, sellerId);
  }

  private async requireSnapshot(
    productDraftId: string,
    sellerId: string,
  ): Promise<SellerProductPublicationSnapshot> {
    return this.get(productDraftId, sellerId);
  }

  private async requireOwnedProduct(productDraftId: string, sellerId: string) {
    const product = await this.products.findOwnedProduct(productDraftId, sellerId);
    if (!product) throw productNotFound();
    return product;
  }
}

function authorizationError(
  result:
    | "not_found"
    | "not_allowed"
    | "direct_product"
    | "cover_not_allowed"
    | "image_required"
    | "images_not_ready"
    | "not_editable"
    | "facts_missing"
    | "title_required"
    | "title_invalid"
    | "description_invalid"
    | "category_required"
    | "product_code_company_unconfigured"
    | "product_code_category_unconfigured"
    | "product_code_allocation_failed",
): SellerProductPublicationError {
  if (result === "not_found") return productNotFound();
  if (result === "image_required") return publicationImageRequired();
  if (result === "images_not_ready") {
    return new SellerProductPublicationError(
      409,
      "product_publication_images_not_ready",
      "The product images are not ready for publication.",
    );
  }
  if (result === "title_required") return publicationTitleRequired();
  if (result === "title_invalid") return publicationTitleInvalid();
  if (result === "description_invalid") return publicationDescriptionInvalid();
  if (result === "category_required") return publicationCategoryRequired();
  if (
    result === "product_code_company_unconfigured" ||
    result === "product_code_category_unconfigured"
  ) {
    return publicationConfigurationInvalid();
  }
  if (result === "product_code_allocation_failed") return publicationUnavailable();
  if (result === "cover_not_allowed" || result === "not_allowed" || result === "not_editable") {
    return publicationNotAllowed();
  }
  if (result === "facts_missing" || result === "direct_product") {
    return publicationUnavailable();
  }
  return publicationNotAllowed();
}

function directSnapshot(
  productDraftId: string,
  productStatus: "draft" | "published" | "archived",
): SellerProductPublicationSnapshot {
  return {
    productDraftId,
    productStatus,
    publicationStatus: "not_required",
    attemptCount: 0,
    failureReasonCode: null,
    retryAllowed: false,
    publicProductUrl: productStatus === "published" ? `/p/${productDraftId}` : null,
  };
}

function durableNotStarted(
  productDraftId: string,
  productStatus: "draft" | "published" | "archived",
): SellerProductPublicationSnapshot {
  return {
    productDraftId,
    productStatus,
    publicationStatus: "not_started",
    attemptCount: 0,
    failureReasonCode: null,
    retryAllowed: false,
    publicProductUrl: productStatus === "published" ? `/p/${productDraftId}` : null,
  };
}

function productNotFound(): SellerProductPublicationError {
  return new SellerProductPublicationError(404, "product_not_found", "The product was not found.");
}

function publicationInvalid(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    400,
    "product_publication_invalid",
    "The selected product category is not supported.",
  );
}

function publicationConfigurationInvalid(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    500,
    "product_publication_configuration_invalid",
    "Product publication is temporarily misconfigured.",
  );
}

function publicationImageRequired(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    409,
    "product_publication_image_required",
    "At least one product picture is required before publication.",
  );
}

export function publicationTitleRequired(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    409,
    "product_publication_title_required",
    "A product title is required before publication.",
  );
}

export function publicationTitleInvalid(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    400,
    "product_publication_title_invalid",
    "The product title must contain at most 50 characters.",
  );
}

export function publicationDescriptionInvalid(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    400,
    "product_publication_description_invalid",
    "Each product description must contain at most 300 characters.",
  );
}

export function publicationCategoryRequired(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    409,
    "product_publication_category_required",
    "A product category is required before publication.",
  );
}

export function publicationInProgress(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    409,
    "product_publication_in_progress",
    "Another product publication is already running.",
  );
}

function publicationNotAllowed(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    409,
    "product_publication_not_allowed",
    "The product cannot be published in its current state.",
  );
}

export function publicationUnavailable(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    503,
    "product_publication_unavailable",
    "Product publication is temporarily unavailable.",
  );
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function requirePublicationTitle(title: string | null | undefined): void {
  const normalized = title?.trim().replace(/\s+/gu, " ") ?? "";
  if (!normalized) throw publicationTitleRequired();
  if (Array.from(normalized).length > PRODUCT_DRAFT_TITLE_MAX_LENGTH) {
    throw publicationTitleInvalid();
  }
}
