import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import {
  SellerProductDraftReadService,
  type SellerProductDraftReadRepository,
} from "./seller-product-draft-read.service";

type Product = Database["public"]["Tables"]["products"]["Row"];

const productDraftId = uuid(1);
const sellerId = uuid(2);
const userId = uuid(3);

describe("SellerProductDraftReadService", () => {
  it("rejects malformed identifiers before seller, product, or gallery access", async () => {
    const repository = memoryRepository();
    const loadGallery = vi.fn();

    await expect(
      new SellerProductDraftReadService(repository).get({
        routeProductDraftId: "not-a-uuid",
        userId,
        loadGallery,
      }),
    ).resolves.toEqual({ product: null, gallery: null });

    expect(repository.findSellerId).not.toHaveBeenCalled();
    expect(repository.findOwnedProduct).not.toHaveBeenCalled();
    expect(loadGallery).not.toHaveBeenCalled();
  });

  it("does not load the gallery when the requester has no seller or does not own the product", async () => {
    const noSellerRepository = memoryRepository();
    noSellerRepository.findSellerId.mockResolvedValue(null);
    const noSellerGallery = vi.fn();

    await expect(
      new SellerProductDraftReadService(noSellerRepository).get({
        routeProductDraftId: productDraftId,
        userId,
        loadGallery: noSellerGallery,
      }),
    ).resolves.toEqual({ product: null, gallery: null });
    expect(noSellerRepository.findOwnedProduct).not.toHaveBeenCalled();
    expect(noSellerGallery).not.toHaveBeenCalled();

    const foreignProductRepository = memoryRepository();
    foreignProductRepository.findOwnedProduct.mockResolvedValue(null);
    const foreignProductGallery = vi.fn();
    await expect(
      new SellerProductDraftReadService(foreignProductRepository).get({
        routeProductDraftId: productDraftId,
        userId,
        loadGallery: foreignProductGallery,
      }),
    ).resolves.toEqual({ product: null, gallery: null });
    expect(foreignProductGallery).not.toHaveBeenCalled();
  });

  it("loads service-role gallery data only after requester-scoped ownership succeeds", async () => {
    const calls: string[] = [];
    const product = productRow();
    const repository: SellerProductDraftReadRepository = {
      findSellerId: vi.fn(async () => {
        calls.push("seller");
        return sellerId;
      }),
      findOwnedProduct: vi.fn(async () => {
        calls.push("product");
        return product;
      }),
      hasSourceMembership: vi.fn(async () => {
        calls.push("provenance");
        return true;
      }),
    };
    const loadGallery = vi.fn(async () => {
      calls.push("gallery");
      return {
        status: "available" as const,
        errorCode: null,
        images: [],
      };
    });

    await expect(
      new SellerProductDraftReadService(repository).get({
        routeProductDraftId: productDraftId,
        userId,
        loadGallery,
      }),
    ).resolves.toEqual({
      product: {
        ...product,
        imagePublicationMode: "imported",
      },
      gallery: {
        status: "available",
        errorCode: null,
        images: [],
      },
    });

    expect(calls).toEqual(["seller", "product", "provenance", "gallery"]);
    expect(repository.findOwnedProduct).toHaveBeenCalledWith(productDraftId, sellerId);
    expect(loadGallery).toHaveBeenCalledWith(product);
  });

  it("stops before gallery access when the stored product code is malformed", async () => {
    const repository = memoryRepository();
    repository.findOwnedProduct.mockResolvedValue(
      productRow({ product_code: "private-malformed-value" }),
    );
    const loadGallery = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      new SellerProductDraftReadService(repository).get({
        routeProductDraftId: productDraftId,
        userId,
        loadGallery,
      }),
    ).rejects.toThrow("temporarily unavailable");

    expect(loadGallery).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[Seller ProductDraft read] Stored product code is invalid.", {
      exceptionClass: "StoredProductCodeError",
      productId: productDraftId,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-malformed-value");
    log.mockRestore();
  });
});

function memoryRepository() {
  return {
    findSellerId: vi.fn(async () => sellerId),
    findOwnedProduct: vi.fn(async () => productRow()),
    hasSourceMembership: vi.fn(async () => false),
  };
}

function productRow(overrides: Partial<Product> = {}): Product {
  return {
    id: productDraftId,
    seller_id: sellerId,
    title: "Cotton shirt",
    title_source: "human",
    description: null,
    category_id: uuid(4),
    product_code: "SEL-F-TSH-ABCDEFGH",
    classifier_group_id: null,
    classifier_organization_id: null,
    cover_image_id: null,
    cover_image_url: null,
    moq: null,
    pack_size: null,
    price: null,
    currency: "USD",
    stock: "in_stock",
    trending: false,
    status: "draft",
    created_at: "2026-07-26T12:00:00.000Z",
    updated_at: "2026-07-26T12:00:00.000Z",
    ...overrides,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
