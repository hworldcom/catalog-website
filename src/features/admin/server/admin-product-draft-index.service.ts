import {
  adminProductDraftsUnavailable,
  type AdminProductDraftIndexItem,
  type AdminProductDraftIndexPage,
  type AdminProductDraftIndexRequest,
  type AdminProductDraftPreview,
} from "../admin-product-draft-index.types";
import { parseStoredProductCode } from "@/features/product-code/product-code";
import {
  decodeAdminProductDraftIndexCursor,
  encodeAdminProductDraftIndexCursor,
} from "../admin-product-draft-index.cursor";
import {
  resolveAdminProductDraftSource,
  selectAdminProductDraftPreviewImageId,
} from "./admin-product-draft-read-model";
import type {
  AdminProductDraftIndexDetails,
  AdminProductDraftIndexProductRecord,
  AdminProductDraftIndexRepository,
} from "./admin-product-draft-index.repository";
import { AdminProductDraftIndexRepositoryError } from "./admin-product-draft-index.repository";
import type { ProductDraftImageDeliveryService } from "./product-draft-image-delivery.service";
import type {
  ConfirmedPrototypeAdministratorContext,
  ProductDraftImageDeliveryResult,
} from "./product-draft-image-delivery.types";

type PreviewDelivery = Pick<ProductDraftImageDeliveryService, "resolve">;

export class AdminProductDraftIndexService {
  constructor(
    private readonly repository: AdminProductDraftIndexRepository,
    private readonly imageDelivery: PreviewDelivery,
  ) {}

  async list(
    request: AdminProductDraftIndexRequest,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<AdminProductDraftIndexPage> {
    try {
      return await this.listPage(request, authorization);
    } catch (error) {
      if (error instanceof AdminProductDraftIndexRepositoryError) {
        console.error("[Admin ProductDraft index] Database read failed.", {
          exceptionClass: error.constructor.name,
        });
        throw adminProductDraftsUnavailable();
      }
      throw error;
    }
  }

  private async listPage(
    request: AdminProductDraftIndexRequest,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<AdminProductDraftIndexPage> {
    const before = request.cursor
      ? decodeAdminProductDraftIndexCursor(request.cursor, request)
      : null;
    const rows = await this.repository.listProducts({
      limit: request.limit + 1,
      status: request.status,
      sellerId: request.sellerId,
      before,
    });
    const hasMore = rows.length > request.limit;
    const products = rows.slice(0, request.limit);
    const productCodeByProduct = new Map(
      products.map((product) => [product.id, readProductCode(product)]),
    );
    const details = await this.repository.loadDetails(products);
    const previewImageIdByProduct = selectPreviewImages(products, details);
    const deliveryByProduct = await this.resolvePreviews(
      products,
      previewImageIdByProduct,
      authorization,
    );

    return {
      items: products.map((product) =>
        buildItem(
          product,
          productCodeByProduct,
          details,
          previewImageIdByProduct,
          deliveryByProduct,
        ),
      ),
      nextCursor:
        hasMore && products.length
          ? encodeAdminProductDraftIndexCursor({
              createdAt: products[products.length - 1]!.created_at,
              productDraftId: products[products.length - 1]!.id,
              limit: request.limit,
              status: request.status,
              sellerId: request.sellerId,
            })
          : null,
    };
  }

  private async resolvePreviews(
    products: AdminProductDraftIndexProductRecord[],
    previewImageIdByProduct: Map<string, string | null>,
    authorization: ConfirmedPrototypeAdministratorContext,
  ): Promise<Map<string, ProductDraftImageDeliveryResult>> {
    const entries = products.flatMap((product) => {
      const imageId = previewImageIdByProduct.get(product.id);
      return imageId ? [{ productDraftId: product.id, imageIds: [imageId] }] : [];
    });
    if (entries.length === 0) return new Map();

    const response = await this.imageDelivery.resolve(entries, authorization);
    return new Map(
      response.entries.flatMap((entry) => {
        const result = entry.images[0];
        return result ? [[entry.productDraftId, result]] : [];
      }),
    );
  }
}

function selectPreviewImages(
  products: AdminProductDraftIndexProductRecord[],
  details: AdminProductDraftIndexDetails,
): Map<string, string | null> {
  const firstImageByProduct = new Map<string, string>();
  for (const image of details.images) {
    if (!firstImageByProduct.has(image.product_draft_id)) {
      firstImageByProduct.set(image.product_draft_id, image.id);
    }
  }

  return new Map(
    products.map((product) => [
      product.id,
      selectAdminProductDraftPreviewImageId(
        product.cover_image_id,
        firstImageByProduct.has(product.id) ? [firstImageByProduct.get(product.id)!] : [],
      ),
    ]),
  );
}

function buildItem(
  product: AdminProductDraftIndexProductRecord,
  productCodeByProduct: Map<string, string>,
  details: AdminProductDraftIndexDetails,
  previewImageIdByProduct: Map<string, string | null>,
  deliveryByProduct: Map<string, ProductDraftImageDeliveryResult>,
): AdminProductDraftIndexItem {
  const seller = details.sellers.find((candidate) => candidate.id === product.seller_id);
  if (!seller) throw adminProductDraftsUnavailable();

  const category = product.category_id
    ? details.categories.find((candidate) => candidate.id === product.category_id)
    : null;
  if (product.category_id && !category) throw adminProductDraftsUnavailable();

  const facts = details.facts.find((candidate) => candidate.product_draft_id === product.id);
  const source = resolveAdminProductDraftSource(
    details.sources.filter((candidate) => candidate.product_draft_id === product.id),
  );
  const previewImageId = previewImageIdByProduct.get(product.id) ?? null;
  const delivery = deliveryByProduct.get(product.id);
  const productCode = productCodeByProduct.get(product.id);
  if (!productCode) throw adminProductDraftsUnavailable();

  return {
    productDraftId: product.id,
    productCode,
    title: product.title,
    status: product.status,
    seller: {
      id: seller.id,
      name: seller.name,
      slug: seller.slug,
    },
    category: category
      ? {
          id: category.id,
          name: category.name,
          slug: category.slug,
        }
      : null,
    factsRevision: facts?.facts_revision ?? null,
    source,
    coverImageId: product.cover_image_id,
    previewImageId,
    preview: buildPreview(previewImageId, delivery),
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}

function readProductCode(product: AdminProductDraftIndexProductRecord): string {
  try {
    return parseStoredProductCode(product.product_code);
  } catch (error) {
    console.error("[Admin ProductDraft index] Stored product code is invalid.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      productId: product.id,
    });
    throw adminProductDraftsUnavailable();
  }
}

function buildPreview(
  previewImageId: string | null,
  delivery: ProductDraftImageDeliveryResult | undefined,
): AdminProductDraftPreview {
  if (!previewImageId) {
    return {
      deliveryStatus: "missing",
      deliveryErrorCode: null,
      url: null,
      expiresAt: null,
    };
  }
  if (!delivery || delivery.imageId !== previewImageId) {
    throw adminProductDraftsUnavailable();
  }

  return {
    deliveryStatus: delivery.deliveryStatus,
    deliveryErrorCode: delivery.deliveryErrorCode,
    url: delivery.url,
    expiresAt: delivery.expiresAt,
  };
}
