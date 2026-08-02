import { z } from "zod";

import { parseStoredProductCode } from "@/features/product-code/product-code";
import type { Database } from "@/lib/supabase/types";

import type { SellerProductDraftGallery } from "../product-draft-image-gallery.types";
import type { SellerProductImagePublicationMode } from "../seller-product-publication.types";

type Product = Database["public"]["Tables"]["products"]["Row"];
export type SellerProductDraft = Product & {
  imagePublicationMode: SellerProductImagePublicationMode;
};

export interface SellerProductDraftReadRepository {
  findSellerId(userId: string): Promise<string | null>;
  findOwnedProduct(productDraftId: string, sellerId: string): Promise<Product | null>;
  hasSourceMembership(productDraftId: string): Promise<boolean>;
}

export type SellerProductDraftReadResult = {
  product: SellerProductDraft | null;
  gallery: SellerProductDraftGallery | null;
};

export class SellerProductDraftReadService {
  constructor(private readonly repository: SellerProductDraftReadRepository) {}

  async get(input: {
    routeProductDraftId: string;
    userId: string;
    loadGallery: (productDraft: Product) => Promise<SellerProductDraftGallery>;
  }): Promise<SellerProductDraftReadResult> {
    const parsedId = z.string().uuid().safeParse(input.routeProductDraftId);
    if (!parsedId.success) return notFound();

    const sellerId = await this.repository.findSellerId(input.userId);
    if (!sellerId) return notFound();

    const product = await this.repository.findOwnedProduct(parsedId.data, sellerId);
    if (!product) return notFound();

    let productCode: string;
    try {
      productCode = parseStoredProductCode(product.product_code);
    } catch (error) {
      console.error("[Seller ProductDraft read] Stored product code is invalid.", {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
        productId: product.id,
      });
      throw new Error("The seller product is temporarily unavailable.");
    }

    const [imagePublicationMode, gallery] = await Promise.all([
      this.repository
        .hasSourceMembership(product.id)
        .then((imported): SellerProductImagePublicationMode => (imported ? "imported" : "direct")),
      input.loadGallery(product),
    ]);

    return {
      product: {
        ...product,
        product_code: productCode,
        imagePublicationMode,
      },
      gallery,
    };
  }
}

function notFound(): SellerProductDraftReadResult {
  return {
    product: null,
    gallery: null,
  };
}
