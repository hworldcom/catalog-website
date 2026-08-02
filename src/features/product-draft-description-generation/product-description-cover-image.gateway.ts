import type { ProductDescriptionGenerationCoverReference } from "./product-draft-description-generation.repository";

export const PRODUCT_DESCRIPTION_COVER_MAX_BYTES = 20 * 1024 * 1024;
export const PRODUCT_DESCRIPTION_COVER_TIMEOUT_MS = 10_000;

export type ProductDescriptionCoverImage = {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Uint8Array;
};

export type ProductDescriptionCoverImageFailureKind = "unsupported" | "unavailable";

export class ProductDescriptionCoverImageError extends Error {
  constructor(public readonly kind: ProductDescriptionCoverImageFailureKind) {
    super(`Product description cover image failed: ${kind}.`);
    this.name = "ProductDescriptionCoverImageError";
  }
}

export interface ProductDescriptionCoverImageGateway {
  load(
    cover: ProductDescriptionGenerationCoverReference,
    signal: AbortSignal,
  ): Promise<ProductDescriptionCoverImage>;
}
