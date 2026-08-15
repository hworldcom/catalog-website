import { z } from "zod";

export const SELLER_PROFILE_IMAGE_BUCKET = "seller-profile-images";
export const SELLER_PROFILE_IMAGE_MAX_SIZE_BYTES = 20 * 1024 * 1024;
export const SELLER_PROFILE_IMAGE_SIGNED_UPLOAD_LIFETIME_SECONDS = 300;

export const sellerProfileAssetKindSchema = z.enum(["logo", "cover"]);
export const sellerProfileImageContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type SellerProfileAssetKind = z.infer<typeof sellerProfileAssetKindSchema>;
export type SellerProfileImageContentType = z.infer<typeof sellerProfileImageContentTypeSchema>;

export const prepareSellerProfileAssetUploadSchema = z.object({
  kind: sellerProfileAssetKindSchema,
  originalFilename: z.string().trim().min(1).max(255),
  contentType: sellerProfileImageContentTypeSchema,
  sizeBytes: z.number().int().min(1).max(SELLER_PROFILE_IMAGE_MAX_SIZE_BYTES),
  requestId: z.string().uuid(),
});

export const sellerProfileAssetIdentifierSchema = z.object({
  assetId: z.string().uuid(),
});

export type PrepareSellerProfileAssetUploadInput = z.infer<
  typeof prepareSellerProfileAssetUploadSchema
>;
export type SellerProfileAssetIdentifierInput = z.infer<typeof sellerProfileAssetIdentifierSchema>;

export type SellerProfileAssetStatus = "pending" | "available" | "deleting" | "failed" | "deleted";

export type SellerProfileAsset = {
  assetId: string;
  sellerId: string;
  kind: SellerProfileAssetKind;
  originalFilename: string;
  contentType: SellerProfileImageContentType;
  sizeBytes: number;
  status: SellerProfileAssetStatus;
  errorCode: string | null;
};

export type PrepareSellerProfileAssetUploadResponse = {
  asset: SellerProfileAsset;
  uploadPath: string | null;
  uploadToken: string | null;
  uploadExpiresAt: string | null;
};

export type SellerProfileImageErrorCode =
  | "seller_profile_image_invalid"
  | "seller_profile_image_required_owner"
  | "seller_profile_image_not_found"
  | "seller_profile_image_conflict"
  | "seller_profile_image_not_ready"
  | "seller_profile_image_cleanup_required"
  | "seller_profile_image_storage_unavailable";

export class SellerProfileImageError extends Error {
  constructor(
    public readonly statusCode: 400 | 403 | 404 | 409 | 503,
    public readonly code: SellerProfileImageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SellerProfileImageError";
  }
}
