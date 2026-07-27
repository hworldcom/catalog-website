import { describe, expect, it, vi } from "vitest";

import type { ProductDraftImageDeliveryEngine } from "@/features/admin/server/product-draft-image-delivery.service";

import type { SellerProductDraftImageGalleryRepository } from "./product-draft-image-gallery.repository";
import { SellerProductDraftImageGalleryService } from "./seller-product-draft-image-gallery.service";

const productDraftId = uuid(1);
const firstImageId = uuid(101);
const secondImageId = uuid(102);

describe("SellerProductDraftImageGalleryService", () => {
  it("returns an empty available gallery without invoking delivery", async () => {
    const repository = { list: vi.fn(async () => []) };
    const delivery = { resolve: vi.fn() };

    await expect(
      new SellerProductDraftImageGalleryService(repository, delivery).get(ownedProduct()),
    ).resolves.toEqual({
      status: "available",
      errorCode: null,
      images: [],
    });
    expect(delivery.resolve).not.toHaveBeenCalled();
  });

  it("maps ordered metadata and preserves per-image delivery states", async () => {
    const repository = memoryRepository();
    const delivery: Pick<ProductDraftImageDeliveryEngine, "resolve"> = {
      resolve: vi.fn(async () => ({
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
      images: [
        {
          imageId: firstImageId,
          sourcePosition: 0,
          durableStatus: "available",
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
      images: [
        {
          imageId: firstImageId,
          sourcePosition: 0,
          durableStatus: "available",
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
      images: [],
    });
    expect(delivery.resolve).not.toHaveBeenCalled();
  });
});

function memoryRepository(): SellerProductDraftImageGalleryRepository {
  return {
    list: vi.fn(async () => [
      {
        imageId: firstImageId,
        productDraftId,
        sourcePosition: 0,
        durableStatus: "available",
        isSourceCover: true,
      },
      {
        imageId: secondImageId,
        productDraftId,
        sourcePosition: 1,
        durableStatus: "failed",
        isSourceCover: false,
      },
    ]),
  };
}

function ownedProduct() {
  return { id: productDraftId };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
