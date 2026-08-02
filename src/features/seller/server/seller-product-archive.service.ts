import { sellerProductIdSchema } from "../seller-product-write.types";
import {
  SellerProductArchiveError,
  type SellerProductArchiveSnapshot,
} from "../seller-product-archive.types";
import type { SellerProductArchiveRepository } from "./seller-product-archive.repository";

export class SellerProductArchiveService {
  constructor(private readonly products: SellerProductArchiveRepository) {}

  async archive(productId: string, sellerId: string | null): Promise<SellerProductArchiveSnapshot> {
    if (!sellerId || !sellerProductIdSchema.safeParse(productId).success) {
      throw productNotFound();
    }

    let result: Awaited<ReturnType<SellerProductArchiveRepository["archive"]>>;
    try {
      result = await this.products.archive(productId, sellerId);
    } catch (error) {
      console.error("[Seller product archive] Database operation failed.", {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
      throw productArchiveUnavailable();
    }

    if (result.result === "product_not_found") throw productNotFound();
    if (result.result === "product_archive_not_allowed") throw productArchiveNotAllowed();
    return {
      productId: result.productId,
      productStatus: result.productStatus,
    };
  }
}

function productNotFound(): SellerProductArchiveError {
  return new SellerProductArchiveError(404, "product_not_found", "The product was not found.");
}

function productArchiveNotAllowed(): SellerProductArchiveError {
  return new SellerProductArchiveError(
    409,
    "product_archive_not_allowed",
    "Wait for active publication or complete publication cleanup before archiving this product.",
  );
}

function productArchiveUnavailable(): SellerProductArchiveError {
  return new SellerProductArchiveError(
    503,
    "product_archive_unavailable",
    "Product archival is temporarily unavailable.",
  );
}
