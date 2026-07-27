import type { ProductDraftTitleSnapshot } from "@/features/product-draft-title/product-draft-title.types";

import {
  SellerProductPublicationError,
  type SellerProductPublicationSnapshot,
} from "../seller-product-publication.types";
import type { SellerProductPublicationInput } from "../seller-product-write.types";
import type { ProductPublicationService } from "./product-publication.service";
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
  ): Promise<SellerProductPublicationSnapshot> {
    const product = await this.requireOwnedProduct(input.id, sellerId);
    if (product.imagePublicationMode === "direct") {
      const cover =
        "cover_image_url" in input
          ? normalizeOptional(input.cover_image_url)
          : product.coverImageUrl;
      if (!cover) throw publicationImageRequired();

      const saved = await this.publishDirectProduct({ sellerId, product: input });
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
    if (!run) return importedNotStarted(product.productDraftId, product.productStatus);
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
      errorCode: run.errorCode,
      retryAllowed: run.retryAllowed,
      publicProductUrl:
        currentProduct.productStatus === "published" ? `/p/${productDraftId}` : null,
    };
  }

  async retry(productDraftId: string, sellerId: string): Promise<SellerProductPublicationSnapshot> {
    const product = await this.requireOwnedProduct(productDraftId, sellerId);
    if (product.imagePublicationMode !== "imported") {
      throw publicationNotAllowed();
    }

    const result = await this.publications.retry(productDraftId, sellerId);
    if (typeof result === "object" && result.result === "dispatch_failed") {
      throw publicationUnavailable();
    }
    if (result === "not_found") throw productNotFound();
    if (result === "not_allowed") throw publicationNotAllowed();

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
    | "facts_missing",
): SellerProductPublicationError {
  if (result === "not_found") return productNotFound();
  if (result === "image_required") return publicationImageRequired();
  if (result === "images_not_ready") {
    return new SellerProductPublicationError(
      409,
      "product_publication_images_not_ready",
      "The imported product images are not ready for publication.",
    );
  }
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
    errorCode: null,
    retryAllowed: false,
    publicProductUrl: productStatus === "published" ? `/p/${productDraftId}` : null,
  };
}

function importedNotStarted(
  productDraftId: string,
  productStatus: "draft" | "published" | "archived",
): SellerProductPublicationSnapshot {
  return {
    productDraftId,
    productStatus,
    publicationStatus: "not_started",
    attemptCount: 0,
    errorCode: null,
    retryAllowed: false,
    publicProductUrl: productStatus === "published" ? `/p/${productDraftId}` : null,
  };
}

function productNotFound(): SellerProductPublicationError {
  return new SellerProductPublicationError(404, "product_not_found", "The product was not found.");
}

function publicationImageRequired(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    409,
    "product_publication_image_required",
    "At least one product picture is required before publication.",
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
