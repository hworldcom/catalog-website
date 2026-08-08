import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { Buffer } from "node:buffer";

import type {
  ProductDescriptionGenerationProvider,
  ProductDescriptionGenerationProviderInput,
  ProductDescriptionGenerationProviderResult,
} from "../product-draft-description-generation.provider";
import { ProductDescriptionGenerationProviderError } from "../product-draft-description-generation.provider";
import {
  PRODUCT_DESCRIPTION_MAX_OUTPUT_TOKENS,
  PRODUCT_DESCRIPTION_PROVIDER_TIMEOUT_MS,
  productDescriptionGenerationOutputSchema,
  productDescriptionGenerationWithoutTitleOutputSchema,
} from "../product-draft-description-generation.types";
import type { ProductDescriptionGenerationConfig } from "./product-draft-description-generation.config";

export const PRODUCT_DESCRIPTION_GENERATION_INSTRUCTIONS = `You create unreviewed multilingual product catalog draft text grounded in one product cover image, optional approved category context, and reviewed structured facts.

First inspect the cover image. Decide whether it clearly shows a catalog product that can support a product-specific description.

If the image is not usable because no product is visible, the product is too unclear or obscured, or the image is unrelated to a catalog product:
- set imageAssessment.usable to false;
- return an empty observedDetails array;
- return null for descriptions and titleProposal;
- do not define or describe the category in general.

If the image is usable:
- set imageAssessment.usable to true;
- return between one and eight concise English observedDetails;
- describe the specific product visible in the image, not the product category in general;
- when an approved category is present, use it only as optional taxonomy context;
- when category is null, identify only visible product characteristics and do not infer, name, or select a taxonomy category;
- use reviewed structured facts as authoritative when they provide a value;
- mention only details supported by the image or reviewed facts.

Visible details may include color, pattern, silhouette, neckline, sleeve or leg style, length, closure, trim, and other clearly observable design features.

Do not infer fiber composition, size, exact fit, brand, origin, certification, performance, quality, or other non-visible facts. Do not treat an uncertain or absent fact as known. Omit unsupported claims instead of guessing.

Return descriptions in Polish, English, German, and Vietnamese. All four descriptions must communicate equivalent product-specific facts in idiomatic language.

Each description must be one concise plain-text catalog paragraph of at most 300 Unicode characters. Do not use headings, bullets, Markdown, HTML, line breaks, or other markup.

Do not mention prices, stock, availability, delivery, promotions, seller contact details, calls to action, or invented branding.

Generated text and title proposals never select, approve, or persist a product category.

Return a concise English title proposal of at most 50 Unicode characters only when titleProposalRequested is true and the image is usable. Otherwise return null.`;

export class OpenAIProductDescriptionGenerationProvider implements ProductDescriptionGenerationProvider {
  private readonly client: OpenAI;

  constructor(
    private readonly config: ProductDescriptionGenerationConfig,
    client?: OpenAI,
  ) {
    this.client =
      client ??
      new OpenAI({
        apiKey: config.apiKey,
        maxRetries: 0,
        timeout: PRODUCT_DESCRIPTION_PROVIDER_TIMEOUT_MS,
      });
  }

  async generate(
    input: ProductDescriptionGenerationProviderInput,
    signal: AbortSignal,
  ): Promise<ProductDescriptionGenerationProviderResult> {
    try {
      const response = await this.client.responses.parse(
        {
          model: this.config.model,
          reasoning: { effort: "none" },
          instructions: PRODUCT_DESCRIPTION_GENERATION_INSTRUCTIONS,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_image",
                  image_url: imageDataUrl(input),
                  detail: "high",
                },
                {
                  type: "input_text",
                  text: JSON.stringify(buildProviderInput(input)),
                },
              ],
            },
          ],
          max_output_tokens: PRODUCT_DESCRIPTION_MAX_OUTPUT_TOKENS,
          store: false,
          text: {
            format: zodTextFormat(
              input.titleProposalRequested
                ? productDescriptionGenerationOutputSchema
                : productDescriptionGenerationWithoutTitleOutputSchema,
              "product_draft_descriptions",
            ),
          },
        },
        { signal },
      );

      for (const item of response.output) {
        if (item.type !== "message" && item.type !== "reasoning") {
          throw new ProductDescriptionGenerationProviderError("output_invalid");
        }
        if (item.type === "message" && item.content.some((content) => content.type === "refusal")) {
          throw new ProductDescriptionGenerationProviderError("failed");
        }
      }
      if (response.status === "incomplete") {
        throw new ProductDescriptionGenerationProviderError("output_invalid");
      }
      if (response.status === "failed") {
        throw new ProductDescriptionGenerationProviderError("failed");
      }
      if (!response.output_parsed) {
        throw new ProductDescriptionGenerationProviderError("output_invalid");
      }

      return {
        output: response.output_parsed,
        provider: "openai",
        model: this.config.model,
        responseId: response.id,
      };
    } catch (error) {
      if (error instanceof ProductDescriptionGenerationProviderError) throw error;
      if (
        error instanceof OpenAI.AuthenticationError ||
        error instanceof OpenAI.PermissionDeniedError ||
        error instanceof OpenAI.NotFoundError
      ) {
        throw new ProductDescriptionGenerationProviderError("configuration_invalid");
      }
      if (error instanceof OpenAI.APIConnectionTimeoutError || isAbortError(error)) {
        throw new ProductDescriptionGenerationProviderError("timeout");
      }
      throw new ProductDescriptionGenerationProviderError("failed");
    }
  }
}

function imageDataUrl(input: ProductDescriptionGenerationProviderInput): string {
  return `data:${input.coverImage.mediaType};base64,${Buffer.from(input.coverImage.bytes).toString("base64")}`;
}

export function buildProviderInput(input: ProductDescriptionGenerationProviderInput) {
  const reviewedFacts: Record<string, unknown> = {
    schemaVersion: input.facts.schemaVersion,
    uncertainFields: input.facts.uncertainFields,
  };
  if (input.facts.colors.length > 0) reviewedFacts.colors = input.facts.colors;
  if (input.facts.materialComposition) {
    reviewedFacts.materialComposition = input.facts.materialComposition;
  }

  const includedSources = Object.fromEntries(
    Object.entries(input.facts.fieldSources).filter(([field]) => field in reviewedFacts),
  );
  if (Object.keys(includedSources).length > 0) reviewedFacts.fieldSources = includedSources;

  return {
    category: input.category
      ? {
          slug: input.category.slug,
          name: input.category.name,
        }
      : null,
    reviewedFacts,
    titleProposalRequested: input.titleProposalRequested,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}
