import type { ProductDraftFacts } from "@/features/product-draft-facts/product-draft-facts.types";

import type { ProductDescriptionGenerationOutput } from "./product-draft-description-generation.types";

export type ProductDescriptionGenerationProviderInput = {
  category: {
    id: string;
    slug: string;
    name: string;
  } | null;
  facts: ProductDraftFacts;
  coverImage: {
    mediaType: "image/jpeg" | "image/png" | "image/webp";
    bytes: Uint8Array;
  };
  titleProposalRequested: boolean;
};

export type ProductDescriptionGenerationProviderResult = {
  output: ProductDescriptionGenerationOutput;
  provider: string;
  model: string;
  responseId: string | null;
};

export type ProductDescriptionGenerationProviderFailureKind =
  "configuration_invalid" | "failed" | "timeout" | "output_invalid";

export class ProductDescriptionGenerationProviderError extends Error {
  constructor(public readonly kind: ProductDescriptionGenerationProviderFailureKind) {
    super(`Product description generation provider failed: ${kind}.`);
    this.name = "ProductDescriptionGenerationProviderError";
  }
}

export interface ProductDescriptionGenerationProvider {
  generate(
    input: ProductDescriptionGenerationProviderInput,
    signal: AbortSignal,
  ): Promise<ProductDescriptionGenerationProviderResult>;
}
