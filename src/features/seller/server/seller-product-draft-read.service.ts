import { z } from "zod";

import { parseStoredProductCodeOrNull } from "@/features/product-code/product-code";
import {
  parseStoredProductAudiences,
  type ProductAudience,
} from "@/features/product-audience/product-audience.types";
import type { Database } from "@/lib/supabase/types";
import {
  parseStoredProductDraftTitleSource,
  type ProductDraftTitleSource,
} from "@/features/product-draft-title/product-draft-title.types";

import type { SellerProductDraftGallery } from "../product-draft-image-gallery.types";
import type { SellerProductImagePublicationMode } from "../seller-product-publication.types";

type Product = Database["public"]["Tables"]["products"]["Row"];
export type SellerProductImageSourceMode = "seller_upload" | "classifier_import";
export type SellerProductDraft = Omit<Product, "title_source"> & {
  audiences: ProductAudience[];
  title_source: ProductDraftTitleSource;
  imagePublicationMode: SellerProductImagePublicationMode;
  imageSourceMode: SellerProductImageSourceMode;
};

export interface SellerProductDraftReadRepository {
  findSellerId(userId: string): Promise<string | null>;
  findOwnedProduct(productDraftId: string, sellerId: string): Promise<Product | null>;
  getAudiences(productDraftId: string): Promise<string[]>;
  getImageSourceState(productDraftId: string): Promise<{
    imageSourceMode: SellerProductImageSourceMode;
    usesDurableImagePublication: boolean;
  }>;
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

    let productCode: string | null;
    try {
      productCode = parseStoredProductCodeOrNull(product.product_code);
    } catch (error) {
      console.error("[Seller ProductDraft read] Stored product code is invalid.", {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
        productId: product.id,
      });
      throw new Error("The seller product is temporarily unavailable.");
    }

    const [imageSourceState, storedAudiences, gallery] = await Promise.all([
      this.repository.getImageSourceState(product.id),
      this.repository.getAudiences(product.id),
      input.loadGallery(product),
    ]);
    if (
      claimsClassifierProvenance(product) &&
      imageSourceState.imageSourceMode !== "classifier_import"
    ) {
      throw new Error("The seller product is temporarily unavailable.");
    }

    return {
      product: {
        ...product,
        audiences: parseStoredProductAudiences(storedAudiences),
        product_code: productCode,
        title_source: parseStoredProductDraftTitleSource(product.title_source),
        imagePublicationMode: imageSourceState.usesDurableImagePublication ? "durable" : "direct",
        imageSourceMode: imageSourceState.imageSourceMode,
      },
      gallery,
    };
  }
}

function claimsClassifierProvenance(product: Product): boolean {
  return product.classifier_group_id !== null || product.classifier_organization_id !== null;
}

function notFound(): SellerProductDraftReadResult {
  return {
    product: null,
    gallery: null,
  };
}
