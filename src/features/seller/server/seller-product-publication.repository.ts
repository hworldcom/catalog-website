export type SellerProductPublicationProduct = {
  productDraftId: string;
  sellerId: string;
  title: string;
  categoryId: string | null;
  productStatus: "draft" | "published" | "archived";
  coverImageUrl: string | null;
  imagePublicationMode: "durable" | "direct";
  sellerApproved: boolean;
};

export interface SellerProductPublicationRepository {
  findOwnedProduct(
    productDraftId: string,
    sellerId: string,
  ): Promise<SellerProductPublicationProduct | null>;
}
