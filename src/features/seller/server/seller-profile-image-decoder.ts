import sharp from "sharp";

import type { SellerProfileImageContentType } from "../seller-profile-media.types";

const MAX_IMAGE_PIXELS = 40_000_000;

export async function decodeSellerProfileImage(
  bytes: Uint8Array,
  expectedContentType: SellerProfileImageContentType,
): Promise<boolean> {
  try {
    const input = Buffer.from(bytes);
    const options = { failOn: "error" as const, limitInputPixels: MAX_IMAGE_PIXELS };
    const metadata = await sharp(input, options).metadata();
    if (!metadata.width || !metadata.height) return false;
    if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) return false;
    if (contentTypeForFormat(metadata.format) !== expectedContentType) return false;

    await sharp(input, options).raw().toBuffer();
    return true;
  } catch {
    return false;
  }
}

function contentTypeForFormat(value: string | undefined): SellerProfileImageContentType | null {
  if (value === "jpeg") return "image/jpeg";
  if (value === "png") return "image/png";
  if (value === "webp") return "image/webp";
  return null;
}
