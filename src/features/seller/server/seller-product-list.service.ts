import type { ProductDraftImageDeliveryEngine } from "@/features/admin/server/product-draft-image-delivery.service";
import type { ProductDraftImageDeliveryResult } from "@/features/admin/server/product-draft-image-delivery.types";
import { parseStoredProductCode } from "@/features/product-code/product-code";

import {
  decodeSellerProductListCursor,
  encodeSellerProductListCursor,
} from "../seller-product-list.cursor";
import {
  sellerProductListUnavailable,
  sellerProductSummaryUnavailable,
  type SellerProductListItem,
  type SellerProductListPage,
  type SellerProductListRequest,
  type SellerProductPreview,
  type SellerProductSummary,
} from "../seller-product-list.types";
import type {
  SellerProductListRecord,
  SellerProductListRepository,
  SellerProductPreviewCandidateRecord,
  SellerProductPreviewCandidateRepository,
} from "./seller-product-list.repository";
import { SellerProductListRepositoryError } from "./seller-product-list.repository";

type PreviewDelivery = Pick<ProductDraftImageDeliveryEngine, "resolve">;

export type SellerProductListLogger = {
  error(
    event: "seller_product_list_preview_unavailable" | "seller_product_list_product_code_invalid",
    context: { exceptionClass: string; productCount?: number; productId?: string },
  ): void;
};

const consoleLogger: SellerProductListLogger = {
  error(event, context) {
    console.error(`[Seller product list] ${event}`, context);
  },
};

export class SellerProductListService {
  constructor(
    private readonly products: SellerProductListRepository,
    private readonly candidates: SellerProductPreviewCandidateRepository,
    private readonly delivery: PreviewDelivery,
    private readonly logger: SellerProductListLogger = consoleLogger,
  ) {}

  async list(sellerId: string, request: SellerProductListRequest): Promise<SellerProductListPage> {
    const before = request.cursor ? decodeSellerProductListCursor(request.cursor, request) : null;

    let rows: SellerProductListRecord[];
    try {
      rows = await this.products.listProducts({
        sellerId,
        limit: request.limit + 1,
        before,
      });
    } catch (error) {
      if (error instanceof SellerProductListRepositoryError) {
        throw sellerProductListUnavailable();
      }
      throw error;
    }

    const hasMore = rows.length > request.limit;
    const pageRows = rows.slice(0, request.limit);
    const browserProducts = pageRows.map((product) => browserProduct(product, this.logger));
    const previewResult = await this.resolvePreviews(pageRows);

    return {
      products: browserProducts.map((product) => ({
        ...product,
        preview: previewResult.previews.get(product.id) ?? unavailablePreview(),
      })),
      nextCursor:
        hasMore && pageRows.length
          ? encodeSellerProductListCursor({
              createdAt: pageRows[pageRows.length - 1]!.created_at,
              productId: pageRows[pageRows.length - 1]!.id,
              limit: request.limit,
            })
          : null,
      previewDelivery: previewResult.delivery,
    };
  }

  private async resolvePreviews(products: SellerProductListRecord[]): Promise<{
    previews: Map<string, SellerProductPreview>;
    delivery: SellerProductListPage["previewDelivery"];
  }> {
    const previews = new Map<string, SellerProductPreview>();
    const productsNeedingFirstImage: SellerProductListRecord[] = [];
    const privateCandidateByProduct = new Map<string, string>();

    for (const product of products) {
      const publicCover = nonblank(product.cover_image_url);
      if (publicCover) {
        previews.set(product.id, publicCoverPreview(publicCover));
      } else if (product.cover_image_id) {
        privateCandidateByProduct.set(product.id, product.cover_image_id);
      } else {
        productsNeedingFirstImage.push(product);
      }
    }

    try {
      const images = await this.candidates.listImages(
        productsNeedingFirstImage.map((product) => product.id),
      );
      const firstImageByProduct = selectFirstImages(images);

      for (const product of products) {
        if (previews.has(product.id)) continue;
        const imageId =
          privateCandidateByProduct.get(product.id) ?? firstImageByProduct.get(product.id) ?? null;
        if (imageId) {
          privateCandidateByProduct.set(product.id, imageId);
        } else {
          previews.set(product.id, noPreview());
        }
      }

      if (privateCandidateByProduct.size === 0) {
        return {
          previews,
          delivery: availableDelivery(),
        };
      }

      const response = await this.delivery.resolve(
        products.flatMap((product) => {
          const imageId = privateCandidateByProduct.get(product.id);
          return imageId ? [{ productDraftId: product.id, imageIds: [imageId] }] : [];
        }),
      );
      const deliveryByProduct = validateDeliveryResponse(
        privateCandidateByProduct,
        response.entries,
      );
      for (const [productId, result] of deliveryByProduct) {
        previews.set(productId, importedPrivatePreview(result));
      }

      return {
        previews,
        delivery: availableDelivery(),
      };
    } catch (error) {
      this.logger.error("seller_product_list_preview_unavailable", {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
        productCount: products.length,
      });

      for (const product of products) {
        if (!previews.has(product.id)) {
          const selectedImageId = privateCandidateByProduct.get(product.id);
          previews.set(
            product.id,
            selectedImageId ? importedPrivateUnavailable(selectedImageId) : unavailablePreview(),
          );
        }
      }
      return {
        previews,
        delivery: {
          status: "unavailable",
          errorCode: "product_draft_image_delivery_unavailable",
        },
      };
    }
  }
}

export class SellerProductSummaryService {
  constructor(private readonly products: Pick<SellerProductListRepository, "countProducts">) {}

  async get(sellerId: string): Promise<SellerProductSummary> {
    try {
      return await this.products.countProducts(sellerId);
    } catch (error) {
      if (error instanceof SellerProductListRepositoryError) {
        throw sellerProductSummaryUnavailable();
      }
      throw error;
    }
  }
}

function selectFirstImages(images: SellerProductPreviewCandidateRecord[]): Map<string, string> {
  const firstByProduct = new Map<string, string>();
  const ordered = [...images].sort(
    (left, right) =>
      left.source_position - right.source_position || left.id.localeCompare(right.id),
  );
  for (const image of ordered) {
    if (!firstByProduct.has(image.product_draft_id)) {
      firstByProduct.set(image.product_draft_id, image.id);
    }
  }
  return firstByProduct;
}

function validateDeliveryResponse(
  expected: Map<string, string>,
  entries: Array<{ productDraftId: string; images: ProductDraftImageDeliveryResult[] }>,
): Map<string, ProductDraftImageDeliveryResult> {
  if (entries.length !== expected.size) {
    throw new Error("ProductDraft image delivery returned an invalid preview entry count.");
  }

  const results = new Map<string, ProductDraftImageDeliveryResult>();
  for (const entry of entries) {
    const expectedImageId = expected.get(entry.productDraftId);
    const result = entry.images[0];
    if (
      !expectedImageId ||
      entry.images.length !== 1 ||
      !result ||
      result.imageId !== expectedImageId ||
      results.has(entry.productDraftId)
    ) {
      throw new Error("ProductDraft image delivery returned an invalid preview.");
    }
    results.set(entry.productDraftId, result);
  }
  return results;
}

function browserProduct(product: SellerProductListRecord, logger: SellerProductListLogger) {
  let productCode: string;
  try {
    productCode = parseStoredProductCode(product.product_code);
  } catch (error) {
    logger.error("seller_product_list_product_code_invalid", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      productId: product.id,
    });
    throw sellerProductListUnavailable();
  }

  return {
    id: product.id,
    title: product.title,
    product_code: productCode,
    cover_image_url: product.cover_image_url,
    price: product.price,
    currency: product.currency,
    moq: product.moq,
    pack_size: product.pack_size,
    stock: product.stock,
    status: product.status,
    created_at: product.created_at,
  };
}

function publicCoverPreview(url: string): SellerProductPreview {
  return {
    source: "public_cover",
    imageId: null,
    deliveryStatus: "available",
    deliveryErrorCode: null,
    url,
    expiresAt: null,
  };
}

function importedPrivatePreview(result: ProductDraftImageDeliveryResult): SellerProductPreview {
  return {
    source: "imported_private",
    imageId: result.imageId,
    deliveryStatus: result.deliveryStatus,
    deliveryErrorCode: result.deliveryErrorCode,
    url: result.url,
    expiresAt: result.expiresAt,
  };
}

function importedPrivateUnavailable(imageId: string): SellerProductPreview {
  return {
    source: "imported_private",
    imageId,
    deliveryStatus: "unavailable",
    deliveryErrorCode: null,
    url: null,
    expiresAt: null,
  };
}

function noPreview(): SellerProductPreview {
  return {
    source: "none",
    imageId: null,
    deliveryStatus: null,
    deliveryErrorCode: null,
    url: null,
    expiresAt: null,
  };
}

function unavailablePreview(): SellerProductPreview {
  return {
    source: "unavailable",
    imageId: null,
    deliveryStatus: "unavailable",
    deliveryErrorCode: null,
    url: null,
    expiresAt: null,
  };
}

function availableDelivery(): SellerProductListPage["previewDelivery"] {
  return {
    status: "available",
    errorCode: null,
  };
}

function nonblank(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}
