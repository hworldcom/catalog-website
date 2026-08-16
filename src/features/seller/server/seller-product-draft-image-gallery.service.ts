import type { ProductDraftImageDeliveryEngine } from "@/features/admin/server/product-draft-image-delivery.service";
import type { ProductDraftImageDeliveryResult } from "@/features/admin/server/product-draft-image-delivery.types";
import type { Database } from "@/lib/supabase/types";

import type {
  SellerProductDraftGallery,
  SellerProductDraftGalleryImage,
} from "../product-draft-image-gallery.types";
import type {
  SellerProductDraftGalleryRecord,
  SellerProductDraftImageGalleryRepository,
} from "./product-draft-image-gallery.repository";

export type SellerProductDraftImageGalleryLogger = {
  error(
    event: "seller_product_draft_image_gallery_unavailable",
    context: {
      productDraftId: string;
      exceptionClass: string;
    },
  ): void;
};

const consoleLogger: SellerProductDraftImageGalleryLogger = {
  error(event, context) {
    console.error(`[Seller ProductDraft gallery] ${event}`, context);
  },
};

export class SellerProductDraftImageGalleryService {
  constructor(
    private readonly repository: SellerProductDraftImageGalleryRepository,
    private readonly delivery: Pick<ProductDraftImageDeliveryEngine, "resolve">,
    private readonly logger: SellerProductDraftImageGalleryLogger = consoleLogger,
  ) {}

  async get(
    ownedProductDraft: Pick<Database["public"]["Tables"]["products"]["Row"], "id">,
  ): Promise<SellerProductDraftGallery> {
    const productDraftId = ownedProductDraft.id;
    let records: SellerProductDraftGalleryRecord[] = [];
    let galleryRevision = 0;
    let moderationRevision = 1;
    try {
      const loaded = await this.repository.list(productDraftId);
      records = loaded.records;
      galleryRevision = loaded.galleryRevision;
      moderationRevision = loaded.moderationRevision;
      if (records.length === 0) return availableGallery(galleryRevision, moderationRevision, []);

      const response = await this.delivery.resolve([
        {
          productDraftId,
          imageIds: records.map((record) => record.imageId),
        },
      ]);
      const results = validateDeliveryResponse(productDraftId, records, response.entries);
      const resultByImageId = new Map(results.map((result) => [result.imageId, result]));

      return availableGallery(
        galleryRevision,
        moderationRevision,
        records.map((record) => mapImage(record, resultByImageId.get(record.imageId)!)),
      );
    } catch (error) {
      this.logger.error("seller_product_draft_image_gallery_unavailable", {
        productDraftId,
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
      return {
        status: "unavailable",
        errorCode: "product_draft_image_delivery_unavailable",
        galleryRevision,
        moderationRevision,
        images: records.map(unavailableImage),
      };
    }
  }
}

function validateDeliveryResponse(
  productDraftId: string,
  records: SellerProductDraftGalleryRecord[],
  entries: Array<{ productDraftId: string; images: ProductDraftImageDeliveryResult[] }>,
): ProductDraftImageDeliveryResult[] {
  if (entries.length !== 1 || entries[0]?.productDraftId !== productDraftId) {
    throw new Error("ProductDraft image delivery returned an invalid gallery entry.");
  }
  const expectedImageIds = new Set(records.map((record) => record.imageId));
  const returnedImageIds = new Set<string>();
  for (const image of entries[0].images) {
    if (!expectedImageIds.has(image.imageId) || returnedImageIds.has(image.imageId)) {
      throw new Error("ProductDraft image delivery returned invalid gallery images.");
    }
    returnedImageIds.add(image.imageId);
  }
  if (returnedImageIds.size !== expectedImageIds.size) {
    throw new Error("ProductDraft image delivery did not return every gallery image.");
  }
  return entries[0].images;
}

function mapImage(
  record: SellerProductDraftGalleryRecord,
  result: ProductDraftImageDeliveryResult,
): SellerProductDraftGalleryImage {
  return {
    imageId: record.imageId,
    sourcePosition: record.sourcePosition,
    durableStatus: record.durableStatus,
    sourceKind: record.sourceKind,
    clientUploadId: record.clientUploadId,
    originalFilename: record.originalFilename,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    lifecycleErrorCode: record.lifecycleErrorCode,
    recoveryAction: record.recoveryAction,
    canRemove: record.canRemove,
    deliveryStatus: result.deliveryStatus,
    deliveryErrorCode: result.deliveryErrorCode,
    url: result.url,
    expiresAt: result.expiresAt,
    isSourceCover: record.isSourceCover,
  };
}

function unavailableImage(record: SellerProductDraftGalleryRecord): SellerProductDraftGalleryImage {
  return {
    imageId: record.imageId,
    sourcePosition: record.sourcePosition,
    durableStatus: record.durableStatus,
    sourceKind: record.sourceKind,
    clientUploadId: record.clientUploadId,
    originalFilename: record.originalFilename,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    lifecycleErrorCode: record.lifecycleErrorCode,
    recoveryAction: record.recoveryAction,
    canRemove: record.canRemove,
    deliveryStatus: "unavailable",
    deliveryErrorCode: null,
    url: null,
    expiresAt: null,
    isSourceCover: record.isSourceCover,
  };
}

function availableGallery(
  galleryRevision: number,
  moderationRevision: number,
  images: SellerProductDraftGalleryImage[],
): SellerProductDraftGallery {
  return {
    status: "available",
    errorCode: null,
    galleryRevision,
    moderationRevision,
    images,
  };
}
