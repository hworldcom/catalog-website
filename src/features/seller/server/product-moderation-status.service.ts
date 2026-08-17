import type { ProductDraftImageDeliveryEngine } from "@/features/admin/server/product-draft-image-delivery.service";
import type { ProductDraftImageDeliveryResult } from "@/features/admin/server/product-draft-image-delivery.types";
import { productModerationSnapshotSchema } from "../product-moderation-snapshot.types";

import {
  productModerationStatusNotFound,
  productModerationStatusUnavailable,
  type ProductModerationStatusDetail,
  type ProductModerationSubmittedImage,
} from "../product-moderation-status.types";
import {
  mapProductModerationStatus,
  ProductModerationStatusMappingError,
} from "./product-moderation-status.mapper";
import {
  ProductModerationStatusRepositoryError,
  type ProductModerationStatusDetailRecord,
  type ProductModerationStatusRepository,
  type ProductModerationSubmittedImageRecord,
} from "./product-moderation-status.repository";

type ImageDelivery = Pick<ProductDraftImageDeliveryEngine, "resolve">;

export type ProductModerationStatusLogger = {
  error(
    event: "product_moderation_submitted_images_unavailable",
    context: { productId: string; imageCount: number; exceptionClass: string },
  ): void;
};

const consoleLogger: ProductModerationStatusLogger = {
  error(event, context) {
    console.error(`[Product moderation status] ${event}`, context);
  },
};

export class ProductModerationStatusService {
  constructor(
    private readonly repository: ProductModerationStatusRepository,
    private readonly delivery: ImageDelivery,
    private readonly logger: ProductModerationStatusLogger = consoleLogger,
  ) {}

  async get(productId: string, sellerId: string): Promise<ProductModerationStatusDetail> {
    let record: ProductModerationStatusDetailRecord | null;
    try {
      record = await this.repository.getOwnedStatus(productId, sellerId);
    } catch (error) {
      if (error instanceof ProductModerationStatusRepositoryError) {
        throw productModerationStatusUnavailable();
      }
      throw error;
    }
    if (!record) throw productModerationStatusNotFound();

    try {
      const common = mapProductModerationStatus(record);
      return {
        ...common,
        submittedRevision: await this.submittedRevision(record),
      };
    } catch (error) {
      if (error instanceof ProductModerationStatusMappingError) {
        throw productModerationStatusUnavailable();
      }
      throw error;
    }
  }

  private async submittedRevision(record: ProductModerationStatusDetailRecord) {
    const submissionId = record.review_submission_id;
    if (!submissionId) {
      if (
        record.submitted_snapshot_schema_version !== null ||
        record.submitted_snapshot_json !== null ||
        record.submitted_images !== null
      ) {
        throw new ProductModerationStatusMappingError(
          "Submitted revision fields exist without a selected review.",
        );
      }
      return null;
    }
    if (
      record.submitted_snapshot_schema_version !== 1 ||
      record.submitted_snapshot_json === null ||
      record.submitted_images === null
    ) {
      throw new ProductModerationStatusMappingError("The submitted revision is incomplete.");
    }
    const snapshot = productModerationSnapshotSchema.safeParse(record.submitted_snapshot_json);
    if (
      !snapshot.success ||
      snapshot.data.productId !== record.id ||
      !snapshotMatchesImages(
        snapshot.data.imageIds,
        snapshot.data.coverImageId,
        record.submitted_images,
      )
    ) {
      throw new ProductModerationStatusMappingError("The submitted revision snapshot is invalid.");
    }

    return {
      submissionId,
      snapshotSchemaVersion: 1 as const,
      snapshot: snapshot.data,
      images: await this.deliverImages(record.id, record.submitted_images),
    };
  }

  private async deliverImages(
    productId: string,
    images: ProductModerationSubmittedImageRecord[],
  ): Promise<ProductModerationSubmittedImage[]> {
    if (images.length === 0) return [];
    try {
      const response = await this.delivery.resolve([
        {
          productDraftId: productId,
          imageIds: images.map((image) => image.productDraftImageId),
        },
      ]);
      const results = response.entries[0];
      if (response.entries.length !== 1 || !results || results.productDraftId !== productId) {
        throw new Error("Submitted image delivery returned an invalid product entry.");
      }
      return combineImages(images, results.images);
    } catch (error) {
      this.logger.error("product_moderation_submitted_images_unavailable", {
        productId,
        imageCount: images.length,
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
      return images.map((image) => ({
        ...image,
        deliveryStatus: "unavailable" as const,
        deliveryErrorCode: "product_draft_image_delivery_unavailable" as const,
        url: null,
        expiresAt: null,
      }));
    }
  }
}

function snapshotMatchesImages(
  snapshotImageIds: string[],
  snapshotCoverImageId: string | null,
  submittedImages: ProductModerationSubmittedImageRecord[],
): boolean {
  const orderedImages = [...submittedImages].sort((left, right) => left.position - right.position);
  if (
    snapshotImageIds.length !== orderedImages.length ||
    snapshotImageIds.some((imageId, index) => imageId !== orderedImages[index]?.productDraftImageId)
  ) {
    return false;
  }
  const submittedCover = orderedImages.find((image) => image.isCover)?.productDraftImageId ?? null;
  return snapshotCoverImageId === submittedCover;
}

function combineImages(
  images: ProductModerationSubmittedImageRecord[],
  delivery: ProductDraftImageDeliveryResult[],
): ProductModerationSubmittedImage[] {
  if (delivery.length !== images.length) {
    throw new Error("Submitted image delivery returned an invalid image count.");
  }
  return images.map((image, index) => {
    const result = delivery[index];
    if (!result || result.imageId !== image.productDraftImageId) {
      throw new Error("Submitted image delivery order is inconsistent.");
    }
    return {
      ...image,
      deliveryStatus: result.deliveryStatus,
      deliveryErrorCode: result.deliveryErrorCode,
      url: result.url,
      expiresAt: result.expiresAt,
    };
  });
}
