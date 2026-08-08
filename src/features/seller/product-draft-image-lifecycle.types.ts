import { z } from "zod";

export const PRODUCT_DRAFT_IMAGE_MAX_COUNT = 20;
export const PRODUCT_DRAFT_IMAGE_MAX_SIZE_BYTES = 20 * 1024 * 1024;
export const PRODUCT_DRAFT_IMAGE_SIGNED_UPLOAD_LIFETIME_SECONDS = 2 * 60 * 60;

export const productDraftImageContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);

export type ProductDraftImageContentType = z.infer<typeof productDraftImageContentTypeSchema>;

const prepareFileSchema = z
  .object({
    clientUploadId: z.string().uuid(),
    originalFilename: z.string().trim().min(1).max(255),
    contentType: productDraftImageContentTypeSchema,
    sizeBytes: z.number().int().min(1).max(PRODUCT_DRAFT_IMAGE_MAX_SIZE_BYTES),
  })
  .strict();

export const prepareProductDraftImageUploadsSchema = z
  .object({
    productDraftId: z.string().uuid(),
    expectedGalleryRevision: z.number().int().nonnegative(),
    files: z.array(prepareFileSchema).min(1).max(PRODUCT_DRAFT_IMAGE_MAX_COUNT),
  })
  .strict()
  .superRefine((input, context) => {
    const identifiers = new Set(input.files.map((file) => file.clientUploadId));
    if (identifiers.size !== input.files.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Client upload identifiers must be unique.",
        path: ["files"],
      });
    }
  });

export const finalizeProductDraftImageUploadsSchema = z
  .object({
    productDraftId: z.string().uuid(),
    imageIds: z.array(z.string().uuid()).min(1).max(PRODUCT_DRAFT_IMAGE_MAX_COUNT),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.imageIds).size !== input.imageIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Image identifiers must be unique.",
        path: ["imageIds"],
      });
    }
  });

export const updateProductDraftImageGallerySchema = z
  .object({
    productDraftId: z.string().uuid(),
    expectedGalleryRevision: z.number().int().nonnegative(),
    orderedAvailableImageIds: z.array(z.string().uuid()).min(1).max(PRODUCT_DRAFT_IMAGE_MAX_COUNT),
    coverImageId: z.string().uuid(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      new Set(input.orderedAvailableImageIds).size !== input.orderedAvailableImageIds.length ||
      !input.orderedAvailableImageIds.includes(input.coverImageId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The ordered image set and cover are inconsistent.",
        path: ["orderedAvailableImageIds"],
      });
    }
  });

export const removeProductDraftImageSchema = z
  .object({
    productDraftId: z.string().uuid(),
    imageId: z.string().uuid(),
    expectedGalleryRevision: z.number().int().nonnegative(),
  })
  .strict();

export const retryProductDraftImageCleanupSchema = z
  .object({
    productDraftId: z.string().uuid(),
    imageId: z.string().uuid(),
  })
  .strict();

export type PrepareProductDraftImageUploadsInput = z.infer<
  typeof prepareProductDraftImageUploadsSchema
>;
export type FinalizeProductDraftImageUploadsInput = z.infer<
  typeof finalizeProductDraftImageUploadsSchema
>;
export type UpdateProductDraftImageGalleryInput = z.infer<
  typeof updateProductDraftImageGallerySchema
>;
export type RemoveProductDraftImageInput = z.infer<typeof removeProductDraftImageSchema>;
export type RetryProductDraftImageCleanupInput = z.infer<
  typeof retryProductDraftImageCleanupSchema
>;

export type PreparedProductDraftImage = {
  imageId: string;
  clientUploadId: string;
  originalFilename: string;
  contentType: ProductDraftImageContentType;
  sizeBytes: number;
  durableStatus: "pending" | "available";
  uploadPath: string | null;
  uploadToken: string | null;
  uploadExpiresAt: string | null;
};

export type PrepareProductDraftImageUploadsResponse = {
  productDraftId: string;
  galleryRevision: number;
  images: PreparedProductDraftImage[];
};

export type FinalizedProductDraftImage = {
  imageId: string;
  durableStatus: "available" | "failed";
  lifecycleErrorCode: string | null;
};

export type FinalizeProductDraftImageUploadsResponse = {
  productDraftId: string;
  galleryRevision: number;
  images: FinalizedProductDraftImage[];
};

export type ProductDraftImageGalleryMutationResponse = {
  productDraftId: string;
  galleryRevision: number;
};

export type ProductDraftImageLifecycleErrorCode =
  | "product_draft_image_upload_invalid"
  | "product_draft_image_upload_limit_exceeded"
  | "product_draft_image_upload_conflict"
  | "product_draft_image_not_found"
  | "product_draft_image_gallery_stale"
  | "product_draft_image_gallery_locked"
  | "product_draft_image_gallery_incomplete"
  | "product_draft_image_verification_failed"
  | "product_draft_image_upload_cleanup_failed"
  | "product_draft_image_delete_failed"
  | "product_draft_image_storage_unavailable";

export class ProductDraftImageLifecycleError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409 | 503,
    public readonly code: ProductDraftImageLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductDraftImageLifecycleError";
  }
}
