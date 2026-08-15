import type {
  PrepareSellerProfileAssetUploadInput,
  SellerProfileAsset,
  SellerProfileAssetKind,
} from "../seller-profile-media.types";

export type SellerProfileAssetRecord = SellerProfileAsset & {
  objectKey: string;
  prepareRequestId: string;
};

export type SellerProfileAssetRemovalClaim =
  { result: "deleted"; objectKey: null } | { result: "deleting"; objectKey: string };

export interface SellerProfileMediaRepository {
  prepare(
    sellerId: string,
    input: PrepareSellerProfileAssetUploadInput,
  ): Promise<SellerProfileAssetRecord>;
  findOwned(sellerId: string, assetId: string): Promise<SellerProfileAssetRecord | null>;
  findById(assetId: string): Promise<SellerProfileAssetRecord | null>;
  findPublic(
    sellerId: string,
    kind: SellerProfileAssetKind,
    revision: number,
  ): Promise<SellerProfileAssetRecord | null>;
  completeUpload(
    sellerId: string,
    assetId: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<SellerProfileAssetRecord>;
  failValidation(sellerId: string, assetId: string): Promise<SellerProfileAssetRecord>;
  beginRemoval(sellerId: string, assetId: string): Promise<SellerProfileAssetRemovalClaim>;
  completeRemoval(sellerId: string, assetId: string): Promise<SellerProfileAssetRecord>;
  failRemoval(sellerId: string, assetId: string): Promise<SellerProfileAssetRecord>;
  claimCleanupRetry(sellerId: string, assetId: string): Promise<SellerProfileAssetRemovalClaim>;
}
