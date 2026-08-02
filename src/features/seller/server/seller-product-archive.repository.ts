export type SellerProductArchiveRepositoryResult =
  | { result: "archived"; productId: string; productStatus: "archived" }
  | { result: "product_not_found" }
  | { result: "product_archive_not_allowed" };

export interface SellerProductArchiveRepository {
  archive(productId: string, sellerId: string): Promise<SellerProductArchiveRepositoryResult>;
}

export class SellerProductArchiveRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SellerProductArchiveRepositoryError";
  }
}
