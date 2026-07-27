export type SellerProductPublicationProduct = {
  productDraftId: string;
  sellerId: string;
  productStatus: "draft" | "published" | "archived";
  coverImageUrl: string | null;
  imagePublicationMode: "imported" | "direct";
};

export interface SellerProductPublicationRepository {
  findOwnedProduct(
    productDraftId: string,
    sellerId: string,
  ): Promise<SellerProductPublicationProduct | null>;
}
