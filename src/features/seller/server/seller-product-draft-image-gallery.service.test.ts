import { describe, expect, it, vi } from "vitest";

import type { ProductDraftImageDeliveryEngine } from "@/features/admin/server/product-draft-image-delivery.service";
import type { ProductDraftImageDeliveryResponse } from "@/features/admin/server/product-draft-image-delivery.types";

import type { SellerProductDraftImageGalleryRepository } from "./product-draft-image-gallery.repository";
import { SellerProductDraftImageGalleryService } from "./seller-product-draft-image-gallery.service";

const productDraftId = uuid(1);
const firstImageId = uuid(101);
const secondImageId = uuid(102);

describe("SellerProductDraftImageGalleryService", () => {
  it("returns an empty available gallery without invoking delivery", async () => {
    const repository = { list: vi.fn(async () => ({ galleryRevision: 0, records: [] })) };
    const delivery = { resolve: vi.fn() };

    await expect(
      new SellerProductDraftImageGalleryService(repository, delivery).get(ownedProduct()),
    ).resolves.toEqual({
      status: "available",
      errorCode: null,
      galleryRevision: 0,
      images: [],
    });
    expect(delivery.resolve).not.toHaveBeenCalled();
  });

  it("maps ordered metadata and preserves per-image delivery states", async () => {
    const repository = memoryRepository();
    const delivery: Pick<ProductDraftImageDeliveryEngine, "resolve"> = {
      resolve: vi.fn(async (): Promise<ProductDraftImageDeliveryResponse> => ({
        entries: [
          {
            productDraftId,
            images: [
              {
                imageId: firstImageId,
                durableStatus: "available",
                deliveryStatus: "available",
                deliveryErrorCode: null,
                url: "https://signed.test/first",
                expiresAt: "2026-07-26T12:05:00.000Z",
              },
              {
                imageId: secondImageId,
                durableStatus: "failed",
                deliveryStatus: "failed",
                deliveryErrorCode: null,
                url: null,
                expiresAt: null,
              },
            ],
          },
        ],
      })),
    };

    await expect(
      new SellerProductDraftImageGalleryService(repository, delivery).get(ownedProduct()),
    ).resolves.toEqual({
      status: "available",
      errorCode: null,
      galleryRevision: 4,
      images: [
        {
          imageId: firstImageId,
          sourcePosition: 0,
          durableStatus: "available",
          sourceKind: "classifier_import",
          clientUploadId: null,
          originalFilename: null,
          contentType: "image/jpeg",
          sizeBytes: 100,
          lifecycleErrorCode: null,
          recoveryAction: null,
          canRemove: false,
          deliveryStatus: "available",
          deliveryErrorCode: null,
          url: "https://signed.test/first",
          expiresAt: "2026-07-26T12:05:00.000Z",
          isSourceCover: true,
        },
        {
          imageId: secondImageId,
          sourcePosition: 1,
          durableStatus: "failed",
          sourceKind: "classifier_import",
          clientUploadId: null,
          originalFilename: null,
          contentType: "image/jpeg",
          sizeBytes: 100,
          lifecycleErrorCode: null,
          recoveryAction: null,
          canRemove: false,
          deliveryStatus: "failed",
          deliveryErrorCode: null,
          url: null,
          expiresAt: null,
          isSourceCover: false,
        },
      ],
    });
  });

  it("preserves loaded metadata as placeholders when total delivery fails", async () => {
    const logger = { error: vi.fn() };
    const delivery = {
      resolve: vi.fn(async () => {
        throw new Error("signing service unavailable");
      }),
    };

    await expect(
      new SellerProductDraftImageGalleryService(memoryRepository(), delivery, logger).get(
        ownedProduct(),
      ),
    ).resolves.toEqual({
      status: "unavailable",
      errorCode: "product_draft_image_delivery_unavailable",
      galleryRevision: 4,
      images: [
        {
          imageId: firstImageId,
          sourcePosition: 0,
          durableStatus: "available",
          sourceKind: "classifier_import",
          clientUploadId: null,
          originalFilename: null,
          contentType: "image/jpeg",
          sizeBytes: 100,
          lifecycleErrorCode: null,
          recoveryAction: null,
          canRemove: false,
          deliveryStatus: "unavailable",
          deliveryErrorCode: null,
          url: null,
          expiresAt: null,
          isSourceCover: true,
        },
        {
          imageId: secondImageId,
          sourcePosition: 1,
          durableStatus: "failed",
          sourceKind: "classifier_import",
          clientUploadId: null,
          originalFilename: null,
          contentType: "image/jpeg",
          sizeBytes: 100,
          lifecycleErrorCode: null,
          recoveryAction: null,
          canRemove: false,
          deliveryStatus: "unavailable",
          deliveryErrorCode: null,
          url: null,
          expiresAt: null,
          isSourceCover: false,
        },
      ],
    });
    expect(logger.error).toHaveBeenCalledWith("seller_product_draft_image_gallery_unavailable", {
      productDraftId,
      exceptionClass: "Error",
    });
  });

  it("returns an unavailable empty gallery when metadata loading fails", async () => {
    const repository = {
      list: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    };
    const delivery = { resolve: vi.fn() };

    await expect(
      new SellerProductDraftImageGalleryService(repository, delivery, {
        error: vi.fn(),
      }).get(ownedProduct()),
    ).resolves.toEqual({
      status: "unavailable",
      errorCode: "product_draft_image_delivery_unavailable",
      galleryRevision: 0,
      images: [],
    });
    expect(delivery.resolve).not.toHaveBeenCalled();
  });
});

function memoryRepository(): SellerProductDraftImageGalleryRepository {
  return {
    list: vi.fn(async (): ReturnType<SellerProductDraftImageGalleryRepository["list"]> => ({
      galleryRevision: 4,
      records: [
        {
          imageId: firstImageId,
          productDraftId,
          sourcePosition: 0,
          durableStatus: "available",
          sourceKind: "classifier_import",
          clientUploadId: null,
          originalFilename: null,
          contentType: "image/jpeg",
          sizeBytes: 100,
          lifecycleErrorCode: null,
          recoveryAction: null,
          canRemove: false,
          isSourceCover: true,
        },
        {
          imageId: secondImageId,
          productDraftId,
          sourcePosition: 1,
          durableStatus: "failed",
          sourceKind: "classifier_import",
          clientUploadId: null,
          originalFilename: null,
          contentType: "image/jpeg",
          sizeBytes: 100,
          lifecycleErrorCode: null,
          recoveryAction: null,
          canRemove: false,
          isSourceCover: false,
        },
      ],
    })),
  };
}

function ownedProduct() {
  return { id: productDraftId };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
