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
      failureReasonCode: null,
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

  it("validates a direct title before its cover requirement", async () => {
    const service = new SellerProductPublicationService(
      productRepository({
        imagePublicationMode: "direct",
        title: "",
        coverImageUrl: null,
      }),
      publicationService(),
      vi.fn(),
    );

    await expect(service.publish(sellerId, productInput())).rejects.toMatchObject({
      statusCode: 409,
      code: "product_publication_title_required",
    });
  });

  it.each([
    ["title_required", 409, "product_publication_title_required"],
    ["title_invalid", 400, "product_publication_title_invalid"],
    ["description_invalid", 400, "product_publication_description_invalid"],
    ["category_required", 409, "product_publication_category_required"],
    ["product_code_company_unconfigured", 500, "product_publication_configuration_invalid"],
    ["product_code_category_unconfigured", 500, "product_publication_configuration_invalid"],
    ["product_code_allocation_failed", 503, "product_publication_unavailable"],
  ] as const)("maps imported database result %s", async (result, statusCode, code) => {
    const publications = publicationService();
    publications.authorize.mockResolvedValueOnce({
      result,
      productDraftId,
    });
    const service = new SellerProductPublicationService(
      productRepository({ imagePublicationMode: "imported" }),
      publications,
      vi.fn(),
    );

    await expect(service.publish(sellerId, productInput())).rejects.toMatchObject({
      statusCode,
      code,
    });
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
      delegatedActionRequestId: null,
      delegatedActionRequestFingerprint: null,
      failureReasonCode: "product_publication_transfer_failed",
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
      failureReasonCode: "product_publication_transfer_failed",
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
      delegatedActionRequestId: null,
      delegatedActionRequestFingerprint: null,
      failureReasonCode: null,
      retryAllowed: false,
    });
    await expect(service.retry(productDraftId, sellerId)).resolves.toMatchObject({
      publicationStatus: "pending",
    });
    expect(publications.retry).toHaveBeenCalledWith(productDraftId, sellerId);
  });

  it.each([
    ["title_required", 409, "product_publication_title_required"],
    ["title_invalid", 400, "product_publication_title_invalid"],
    ["description_invalid", 400, "product_publication_description_invalid"],
  ] as const)("maps retry database result %s", async (result, statusCode, code) => {
    const publications = publicationService();
    publications.retry.mockResolvedValueOnce(result);
    const service = new SellerProductPublicationService(
      productRepository({ imagePublicationMode: "imported" }),
      publications,
      vi.fn(),
    );

    await expect(service.retry(productDraftId, sellerId)).rejects.toMatchObject({
      statusCode,
      code,
    });
  });
});

function productRepository(
  overrides: Partial<SellerProductPublicationProduct> = {},
): SellerProductPublicationRepository {
  return {
    findOwnedProduct: vi.fn<SellerProductPublicationRepository["findOwnedProduct"]>(async () => ({
      productDraftId,
      sellerId,
      title: "Cotton shirt",
      categoryId: uuid(3),
      productStatus: "draft",
      coverImageUrl: null,
      imagePublicationMode: "imported",
      ...overrides,
    })),
  };
}

function publicationService() {
  return {
    authorize: vi.fn<ProductPublicationService["authorize"]>(async () => ({
      result: "pending",
      productDraftId,
      status: "pending",
    })),
    get: vi.fn<ProductPublicationService["get"]>(async () => ({
      productDraftId,
      sellerId,
      status: "pending",
      attemptCount: 0,
      attemptToken: null,
      claimStartedAt: null,
      errorCode: null,
      completedAt: null,
      delegatedActionRequestId: null,
      delegatedActionRequestFingerprint: null,
      failureReasonCode: null,
      retryAllowed: false,
    })),
    retry: vi.fn<ProductPublicationService["retry"]>(async () => "requeued"),
  } satisfies Pick<ProductPublicationService, "authorize" | "get" | "retry"> & {
    authorize: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
  };
}

function productInput() {
  return {
    id: productDraftId,
    category_id: uuid(3),
    currency: "EUR",
    stock: "in_stock" as const,
    trending: false,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
