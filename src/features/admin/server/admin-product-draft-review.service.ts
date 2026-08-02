import {
  adminProductDraftNotFound,
  adminProductDraftReviewUnavailable,
  type AdminProductDraftReview,
  type AdminProductDraftReviewImage,
  type AdminProductDraftReviewRequest,
} from "../admin-product-draft-review.types";
import { parseStoredProductCode } from "@/features/product-code/product-code";
import {
  resolveAdminProductDraftSource,
  selectAdminProductDraftPreviewImageId,
} from "./admin-product-draft-read-model";
import type { AdminProductDraftReviewRepository } from "./admin-product-draft-review.repository";
import { AdminProductDraftReviewRepositoryError } from "./admin-product-draft-review.repository";
import type { ProductDraftImageDeliveryService } from "./product-draft-image-delivery.service";
import type {
  ConfirmedPrototypeAdministratorContext,
  ProductDraftImageDeliveryResult,
} from "./product-draft-image-delivery.types";

type GalleryDelivery = Pick<ProductDraftImageDeliveryService, "resolve">;

export class AdminProductDraftReviewService {
  constructor(
    private readonly repository: AdminProductDraftReviewRepository,
    private readonly imageDelivery: GalleryDelivery,
  ) {}

  async get(
    request: AdminProductDraftReviewRequest,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<AdminProductDraftReview> {
    try {
      return await this.loadReview(request.productDraftId, authorization);
    } catch (error) {
      if (error instanceof AdminProductDraftReviewRepositoryError) {
        console.error("[Admin ProductDraft review] Database read failed.", {
          exceptionClass: error.constructor.name,
        });
        throw adminProductDraftReviewUnavailable();
      }
      throw error;
    }
  }

  private async loadReview(
    productDraftId: string,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<AdminProductDraftReview> {
    const data = await this.repository.load(productDraftId);
    if (!data) throw adminProductDraftNotFound();
    if (!data.seller || (data.product.category_id && !data.category)) {
      throw adminProductDraftReviewUnavailable();
    }
    const productCode = readProductCode(data.product);

    const images = [...data.images].sort(
      (left, right) =>
        left.source_position - right.source_position || left.id.localeCompare(right.id),
    );
    if (
      data.product.cover_image_id &&
      !images.some((image) => image.id === data.product.cover_image_id)
    ) {
      throw adminProductDraftReviewUnavailable();
    }

    const deliveryByImage = await this.resolveGallery(productDraftId, images, authorization);
    const reviewImages = images.map((image): AdminProductDraftReviewImage => {
      const delivery = deliveryByImage.get(image.id);
      if (!delivery) throw adminProductDraftReviewUnavailable();
      return {
        imageId: image.id,
        sourcePosition: image.source_position,
        status: image.status,
        deliveryStatus: delivery.deliveryStatus,
        deliveryErrorCode: delivery.deliveryErrorCode,
        isCover: data.product.cover_image_id === image.id,
        url: delivery.url,
        expiresAt: delivery.expiresAt,
      };
    });
    const previewImageId = selectAdminProductDraftPreviewImageId(
      data.product.cover_image_id,
      images.map((image) => image.id),
    );
    const preview = previewImageId
      ? reviewImages.find((image) => image.imageId === previewImageId)
      : null;
    if (previewImageId && !preview) throw adminProductDraftReviewUnavailable();

    return {
      productDraftId: data.product.id,
      productCode,
      title: data.product.title,
      titleSource: data.product.title_source,
      status: data.product.status,
      seller: {
        id: data.seller.id,
        name: data.seller.name,
        slug: data.seller.slug,
      },
      category: data.category
        ? {
            id: data.category.id,
            name: data.category.name,
            slug: data.category.slug,
          }
        : null,
      source: resolveAdminProductDraftSource(data.sources),
      coverImageId: data.product.cover_image_id,
      previewImageId,
      previewDeliveryStatus: preview?.deliveryStatus ?? "missing",
      previewDeliveryErrorCode:
        preview?.deliveryStatus === "unavailable" ? preview.deliveryErrorCode : null,
      images: reviewImages,
      createdAt: data.product.created_at,
      updatedAt: data.product.updated_at,
    };
  }

  private async resolveGallery(
    productDraftId: string,
    images: Array<{ id: string }>,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<Map<string, ProductDraftImageDeliveryResult>> {
    if (images.length === 0) return new Map();
    const response = await this.imageDelivery.resolve(
      [{ productDraftId, imageIds: images.map((image) => image.id) }],
      authorization,
    );
    if (response.entries.length !== 1 || response.entries[0]?.productDraftId !== productDraftId) {
      throw adminProductDraftReviewUnavailable();
    }

    const deliveryByImage = new Map<string, ProductDraftImageDeliveryResult>();
    for (const result of response.entries[0].images) {
      if (deliveryByImage.has(result.imageId)) throw adminProductDraftReviewUnavailable();
      deliveryByImage.set(result.imageId, result);
    }
    return deliveryByImage;
  }
}

function readProductCode(product: { id: string; product_code: unknown }): string {
  try {
    return parseStoredProductCode(product.product_code);
  } catch (error) {
    console.error("[Admin ProductDraft review] Stored product code is invalid.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      productId: product.id,
    });
    throw adminProductDraftReviewUnavailable();
  }
}
