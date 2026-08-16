import { describe, expect, it, vi } from "vitest";

import type { ProductDraftImageDeliveryResponse } from "@/features/admin/server/product-draft-image-delivery.types";

import type {
  SellerProductListRecord,
  SellerProductListRepository,
  SellerProductPreviewCandidateRecord,
  SellerProductPreviewCandidateRepository,
} from "./seller-product-list.repository";
import { SellerProductListRepositoryError } from "./seller-product-list.repository";
import {
  SellerProductListService,
  SellerProductSummaryService,
} from "./seller-product-list.service";

class MemoryProducts implements SellerProductListRepository {
  readonly listProducts = vi.fn(async () => this.rows);
  readonly countProducts = vi.fn(async () => ({
    productCount: this.rows.length,
    publishedProductCount: this.rows.filter((row) => row.status === "published").length,
  }));

  constructor(readonly rows: SellerProductListRecord[]) {}
}

class MemoryCandidates implements SellerProductPreviewCandidateRepository {
  readonly listImages = vi.fn(async () => this.images);

  constructor(readonly images: SellerProductPreviewCandidateRecord[]) {}
}

describe("SellerProductListService", () => {
  it("builds one stable page with public, selected, first-image, and empty previews", async () => {
    const publicProduct = product(1, {
      cover_image_url: " https://public.test/cover.jpg ",
    });
    const selectedProduct = product(2, { cover_image_id: uuid(202) });
    const firstImageProduct = product(3);
    const emptyProduct = product(4, { product_code: null });
    const extra = product(5);
    const products = new MemoryProducts([
      publicProduct,
      selectedProduct,
      firstImageProduct,
      emptyProduct,
      extra,
    ]);
    const candidates = new MemoryCandidates([
      image(firstImageProduct.id, 302, 1),
      image(firstImageProduct.id, 301, 0),
    ]);
    const resolve = vi.fn(async (input: unknown): Promise<ProductDraftImageDeliveryResponse> => {
      const entries = input as Array<{ productDraftId: string; imageIds: string[] }>;
      return {
        entries: entries.map((entry) => ({
          productDraftId: entry.productDraftId,
          images: [availableDelivery(entry.imageIds[0]!)],
        })),
      };
    });
    const service = new SellerProductListService(products, candidates, { resolve });

    const page = await service.list(uuid(900), { limit: 4, cursor: null, status: "active" });

    expect(products.listProducts).toHaveBeenCalledWith({
      sellerId: uuid(900),
      status: "active",
      limit: 5,
      before: null,
    });
    expect(candidates.listImages).toHaveBeenCalledWith([firstImageProduct.id, emptyProduct.id]);
    expect(resolve).toHaveBeenCalledWith([
      { productDraftId: selectedProduct.id, imageIds: [uuid(202)] },
      { productDraftId: firstImageProduct.id, imageIds: [uuid(301)] },
    ]);
    expect(page.products.map((item) => item.preview)).toEqual([
      {
        source: "public_cover",
        imageId: null,
        deliveryStatus: "available",
        deliveryErrorCode: null,
        url: "https://public.test/cover.jpg",
        expiresAt: null,
      },
      expect.objectContaining({ source: "private_draft", imageId: uuid(202) }),
      expect.objectContaining({ source: "private_draft", imageId: uuid(301) }),
      {
        source: "none",
        imageId: null,
        deliveryStatus: null,
        deliveryErrorCode: null,
        url: null,
        expiresAt: null,
      },
    ]);
    expect(page.products[3]?.product_code).toBeNull();
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.previewDelivery).toEqual({ status: "available", errorCode: null });
  });

  it("preserves rows and known candidates during a total preview failure", async () => {
    const publicProduct = product(1, { cover_image_url: "https://public.test/cover.jpg" });
    const selectedProduct = product(2, { cover_image_id: uuid(202) });
    const fallbackProduct = product(3);
    const products = new MemoryProducts([publicProduct, selectedProduct, fallbackProduct]);
    const candidates = new MemoryCandidates([image(fallbackProduct.id, 301, 0)]);
    const logger = { error: vi.fn() };
    const service = new SellerProductListService(
      products,
      candidates,
      { resolve: vi.fn().mockRejectedValue(new Error("storage unavailable")) },
      logger,
    );

    const page = await service.list(uuid(900), { limit: 25, cursor: null, status: "active" });

    expect(page.products).toHaveLength(3);
    expect(page.products[0]?.preview.source).toBe("public_cover");
    expect(page.products[1]?.preview).toMatchObject({
      source: "private_draft",
      imageId: uuid(202),
      deliveryStatus: "unavailable",
    });
    expect(page.products[2]?.preview).toMatchObject({
      source: "private_draft",
      imageId: uuid(301),
      deliveryStatus: "unavailable",
    });
    expect(page.previewDelivery).toEqual({
      status: "unavailable",
      errorCode: "product_draft_image_delivery_unavailable",
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("maps product-row failures to the stable list error", async () => {
    const products = new MemoryProducts([]);
    products.listProducts.mockRejectedValue(
      new SellerProductListRepositoryError("database unavailable"),
    );
    const service = new SellerProductListService(products, new MemoryCandidates([]), {
      resolve: vi.fn(),
    });

    await expect(
      service.list(uuid(900), { limit: 25, cursor: null, status: "active" }),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "seller_product_list_unavailable",
    });
  });

  it("maps a malformed stored product code without logging its value", async () => {
    const malformed = product(1, { product_code: "private-malformed-value" });
    const logger = { error: vi.fn() };
    const candidates = new MemoryCandidates([]);
    const service = new SellerProductListService(
      new MemoryProducts([malformed]),
      candidates,
      { resolve: vi.fn() },
      logger,
    );

    await expect(
      service.list(uuid(900), { limit: 25, cursor: null, status: "active" }),
    ).rejects.toMatchObject({
      code: "seller_product_list_unavailable",
    });
    expect(logger.error).toHaveBeenCalledWith("seller_product_list_product_code_invalid", {
      exceptionClass: "StoredProductCodeError",
      productId: malformed.id,
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(malformed.product_code);
    expect(candidates.listImages).not.toHaveBeenCalled();
  });

  it("does not invoke delivery when the page has no private candidates", async () => {
    const products = new MemoryProducts([
      product(1, { cover_image_url: "https://public.test/cover.jpg" }),
      product(2),
    ]);
    const candidates = new MemoryCandidates([]);
    const resolve = vi.fn();
    const service = new SellerProductListService(products, candidates, { resolve });

    const page = await service.list(uuid(900), { limit: 25, cursor: null, status: "active" });

    expect(resolve).not.toHaveBeenCalled();
    expect(page.products[1]?.preview.source).toBe("none");
  });
});

describe("SellerProductSummaryService", () => {
  it("returns exact repository counts and maps repository failures", async () => {
    const products = new MemoryProducts([product(1), product(2, { status: "published" })]);
    const service = new SellerProductSummaryService(products);

    await expect(service.get(uuid(900))).resolves.toEqual({
      productCount: 2,
      publishedProductCount: 1,
    });

    products.countProducts.mockRejectedValueOnce(
      new SellerProductListRepositoryError("database unavailable"),
    );
    await expect(service.get(uuid(900))).rejects.toMatchObject({
      statusCode: 500,
      code: "seller_product_summary_unavailable",
    });
  });
});

function product(
  value: number,
  overrides: Partial<SellerProductListRecord> = {},
): SellerProductListRecord {
  return {
    id: uuid(value),
    title: `Product ${value}`,
    product_code: "SEL-F-TSH-ABCDEFGH",
    cover_image_id: null,
    cover_image_url: null,
    price: null,
    currency: "USD",
    moq: null,
    pack_size: null,
    stock: "in_stock",
    status: "draft",
    moderation_revision: 1,
    has_working_copy: false,
    review_submission_id: null,
    review_kind: null,
    review_revision: null,
    review_status: null,
    review_submitted_at: null,
    review_decided_at: null,
    review_seller_visible_reason: null,
    activation_run_id: null,
    activation_phase: null,
    activation_status: null,
    activation_dispatch_status: null,
    activation_dispatch_generation: null,
    activation_dispatch_error_code: null,
    activation_error_code: null,
    can_edit: true,
    can_submit: true,
    can_withdraw: false,
    can_abandon_failed_activation: false,
    can_retry_abandonment_cleanup: false,
    can_archive: true,
    can_restore: false,
    created_at: `2026-07-27T10:00:${String(59 - value).padStart(2, "0")}.000Z`,
    ...overrides,
  };
}

function image(
  productDraftId: string,
  value: number,
  sourcePosition: number,
): SellerProductPreviewCandidateRecord {
  return {
    id: uuid(value),
    product_draft_id: productDraftId,
    source_position: sourcePosition,
  };
}

function availableDelivery(imageId: string) {
  return {
    imageId,
    durableStatus: "available" as const,
    deliveryStatus: "available" as const,
    deliveryErrorCode: null,
    url: `https://signed.test/${imageId}`,
    expiresAt: "2026-07-27T10:05:00.000Z",
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
