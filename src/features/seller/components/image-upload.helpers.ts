export const IMAGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export const IMAGE_UPLOAD_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ImageUploadMimeType = keyof typeof IMAGE_UPLOAD_EXTENSIONS;
export type ImageUploadExtension = (typeof IMAGE_UPLOAD_EXTENSIONS)[ImageUploadMimeType];
export type ImageUploadFolder = "products" | "storefront";

type ImageUploadCandidate = Pick<File, "size" | "type">;

export function validateImageUpload(file: ImageUploadCandidate):
  | { ok: true; extension: ImageUploadExtension }
  | {
      ok: false;
      message: "Only JPG, PNG, or WebP images are allowed." | "Image must be 20 MB or smaller.";
    } {
  const extension = IMAGE_UPLOAD_EXTENSIONS[file.type as ImageUploadMimeType];

  if (!extension) {
    return { ok: false, message: "Only JPG, PNG, or WebP images are allowed." };
  }

  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return { ok: false, message: "Image must be 20 MB or smaller." };
  }

  return { ok: true, extension };
}

export function buildImageUploadPath({
  userId,
  folder,
  extension,
  objectId = crypto.randomUUID(),
}: {
  userId: string;
  folder: ImageUploadFolder;
  extension: ImageUploadExtension;
  objectId?: string;
}): string {
  return `${userId}/${folder}/${objectId}.${extension}`;
}
