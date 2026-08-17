import type { ProductDraftDescriptionSnapshot } from "@/features/product-draft-descriptions/product-draft-descriptions.types";
import type { ProductDraftFacts } from "@/features/product-draft-facts/product-draft-facts.types";
import type { ProductDraftTitleSnapshot } from "@/features/product-draft-title/product-draft-title.types";

import type { NormalizedProductDescriptionGenerationOutput } from "./product-draft-description-generation.types";

export type ProductDescriptionGenerationCoverReference =
  | {
      source: "private_draft";
      imageId: string;
      storageBucket: "product-draft-images";
      objectKey: string;
      contentType: "image/jpeg" | "image/png" | "image/webp";
      sizeBytes: number;
    }
  | {
      source: "public_product_upload";
      imageUrl: string;
    };

export type ProductDescriptionGenerationClaim = {
  result: "claimed";
  workingCopy?: boolean;
  moderationRevision?: number;
  attemptToken: string;
  category: {
    id: string;
    slug: string;
    name: string;
  } | null;
  factsRevision: number;
  facts: ProductDraftFacts;
  humanLanguages: Array<"pl" | "en" | "de" | "vi">;
  titleBlank: boolean;
  cover: ProductDescriptionGenerationCoverReference;
};

export type ProductDescriptionGenerationClaimResult =
  | ProductDescriptionGenerationClaim
  | {
      result:
        | "not_found"
        | "not_editable"
        | "input_changed"
        | "category_missing"
        | "cover_missing"
        | "cover_not_ready"
        | "facts_missing"
        | "no_writable_targets"
        | "in_progress";
    };

export type ProductDescriptionGenerationFinalizationResult =
  | {
      result: "completed";
      descriptionSnapshot: ProductDraftDescriptionSnapshot;
      titleSnapshot: ProductDraftTitleSnapshot;
    }
  | {
      result: "not_found" | "not_editable" | "facts_missing" | "input_changed" | "superseded";
    };

export type ProductDescriptionGenerationFailureResult = "failed" | "not_found" | "superseded";

export interface ProductDescriptionGenerationRepository {
  claim(
    productDraftId: string,
    expectedSellerId: string,
    expectedModerationRevision: number,
  ): Promise<ProductDescriptionGenerationClaimResult>;

  finalize(input: {
    productDraftId: string;
    expectedSellerId: string;
    claim: ProductDescriptionGenerationClaim;
    output: NormalizedProductDescriptionGenerationOutput;
    provider: string;
    model: string;
    pipelineVersion: string;
    generatedAt: string;
  }): Promise<ProductDescriptionGenerationFinalizationResult>;

  fail(input: {
    productDraftId: string;
    expectedSellerId: string;
    attemptToken: string;
    errorCode:
      | "product_description_generation_provider_failed"
      | "product_description_generation_provider_timeout"
      | "product_description_generation_output_invalid"
      | "product_description_generation_configuration_invalid"
      | "product_description_generation_cover_unsupported"
      | "product_description_generation_cover_unavailable"
      | "product_description_generation_image_not_usable";
  }): Promise<ProductDescriptionGenerationFailureResult>;
}
