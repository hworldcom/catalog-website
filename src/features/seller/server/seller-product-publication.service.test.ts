import { describe, expect, it, vi } from "vitest";

import type { ProductPublicationService } from "./product-publication.service";
import type {
  SellerProductPublicationProduct,
  SellerProductPublicationRepository,
} from "./seller-product-publication.repository";
import { SellerProductPublicationService } from "./seller-product-publication.service";

const productDraftId = uuid(1);
const sellerId = uuid(2);

describe("SellerProductPublicationService", () => {
  it("uses the synchronous path for a directly created seller product", async () => {
    const publications = publicationService();
    const publishDirect = vi.fn(async () => ({
      productDraftId,
      title: "Cotton shirt",
      titleSource: "human" as const,
      productStatus: "published" as const,
      editable: false,
    }));
    const service = new SellerProductPublicationService(
      productRepository({ imagePublicationMode: "direct", coverImageUrl: "https://image.test/a" }),
      publications,
      publishDirect,
    );

    await expect(service.publish(sellerId, productInput())).resolves.toEqual({
      productDraftId,
      productStatus: "published",
      publicationStatus: "not_required",
      attemptCount: 0,
      errorCode: null,
      retryAllowed: false,
      publicProductUrl: `/p/${productDraftId}`,
    });
    expect(publishDirect).toHaveBeenCalledOnce();
    expect(publications.authorize).not.toHaveBeenCalled();
  });

  it("authorizes imported publication with server-derived provenance and no cover patch", async () => {
    const publications = publicationService();
    const service = new SellerProductPublicationService(
      productRepository({ imagePublicationMode: "imported" }),
      publications,
      vi.fn(),
    );

    await expect(service.publish(sellerId, productInput())).resolves.toMatchObject({
      productDraftId,
      publicationStatus: "pending",
    });
    expect(publications.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        productDraftId,
        sellerId,
        coverImageUrlPatchPresent: false,
        coverImageUrl: null,
      }),
    );
  });

  it("rejects an imported cover patch and preserves non-disclosing ownership", async () => {
    const publications = publicationService();
    publications.authorize.mockResolvedValueOnce({
      result: "cover_not_allowed",
      productDraftId,
    });
    const service = new SellerProductPublicationService(
      productRepository({ imagePublicationMode: "imported" }),
      publications,
      vi.fn(),
    );

    await expect(
      service.publish(sellerId, {
        ...productInput(),
        cover_image_url: "https://malicious.test/replacement.jpg",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "product_publication_not_allowed",
    });

    await expect(
      new SellerProductPublicationService(
        { findOwnedProduct: vi.fn(async () => null) },
        publications,
        vi.fn(),
      ).get(productDraftId, sellerId),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "product_not_found",
    });
  });

  it("returns only the browser-safe durable snapshot and server retry decision", async () => {
    const publications = publicationService();
    publications.get.mockResolvedValue({
      productDraftId,
      sellerId,
      status: "failed",
      attemptCount: 2,
      attemptToken: uuid(9),
      claimStartedAt: "2026-07-27T08:00:00.000Z",
      errorCode: "product_publication_transfer_failed",
      completedAt: null,
      retryAllowed: true,
    });
    publications.retry.mockResolvedValue("requeued");
    const service = new SellerProductPublicationService(
      productRepository({ imagePublicationMode: "imported" }),
      publications,
      vi.fn(),
    );

    const snapshot = await service.get(productDraftId, sellerId);
    expect(snapshot).toEqual({
      productDraftId,
      productStatus: "draft",
      publicationStatus: "failed",
      attemptCount: 2,
      errorCode: "product_publication_transfer_failed",
      retryAllowed: true,
      publicProductUrl: null,
    });
    expect(snapshot).not.toHaveProperty("attemptToken");

    publications.get.mockResolvedValue({
      productDraftId,
      sellerId,
      status: "pending",
      attemptCount: 2,
      attemptToken: null,
      claimStartedAt: null,
      errorCode: null,
      completedAt: null,
      retryAllowed: false,
    });
    await expect(service.retry(productDraftId, sellerId)).resolves.toMatchObject({
      publicationStatus: "pending",
    });
    expect(publications.retry).toHaveBeenCalledWith(productDraftId, sellerId);
  });
});

function productRepository(
  overrides: Partial<SellerProductPublicationProduct> = {},
): SellerProductPublicationRepository {
  return {
    findOwnedProduct: vi.fn(async () => ({
      productDraftId,
      sellerId,
      productStatus: "draft",
      coverImageUrl: null,
      imagePublicationMode: "imported",
      ...overrides,
    })),
  };
}

function publicationService() {
  return {
    authorize: vi.fn(async () => ({
      result: "pending" as const,
      productDraftId,
      status: "pending" as const,
    })),
    get: vi.fn(async () => ({
      productDraftId,
      sellerId,
      status: "pending" as const,
      attemptCount: 0,
      attemptToken: null,
      claimStartedAt: null,
      errorCode: null,
      completedAt: null,
      retryAllowed: false,
    })),
    retry: vi.fn(async () => "requeued" as const),
  } satisfies Pick<ProductPublicationService, "authorize" | "get" | "retry"> & {
    authorize: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
  };
}

function productInput() {
  return {
    id: productDraftId,
    currency: "EUR",
    stock: "in_stock" as const,
    trending: false,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
