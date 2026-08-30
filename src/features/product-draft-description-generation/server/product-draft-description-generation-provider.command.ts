import { OpenAIProductDescriptionGenerationProvider } from "./openai-product-description-generation.provider";
import { readFile } from "node:fs/promises";
import { readProductDescriptionGenerationConfig } from "./product-draft-description-generation.config";
import { ProductDescriptionGenerationProviderError } from "../product-draft-description-generation.provider";
import {
  normalizeProductDescriptionGenerationOutput,
  ProductDescriptionGenerationError,
  ProductDescriptionGenerationImageNotUsableError,
  ProductDescriptionGenerationOutputError,
} from "../product-draft-description-generation.types";

async function main() {
  const config = readProductDescriptionGenerationConfig();
  const provider = new OpenAIProductDescriptionGenerationProvider(config);
  const controller = new AbortController();
  const coverBytes = await readFile(
    new URL("../../../../public/assets/marketplace/category-womenswear.jpg", import.meta.url),
  );
  const result = await provider.generate(
    {
      category: {
        id: "00000000-0000-0000-0000-000000000001",
        slug: "fabrics",
        name: "Fabrics",
      },
      coverImage: {
        mediaType: "image/jpeg",
        bytes: coverBytes,
      },
      facts: {
        schemaVersion: 2,
        colors: [],
        materialComposition: null,
        uncertainFields: [],
        fieldSources: {
          colors: null,
          materialComposition: null,
        },
      },
      titleProposalRequested: false,
    },
    controller.signal,
  );
  normalizeProductDescriptionGenerationOutput(result.output, false);
  console.info("Product description generation provider QA passed.", {
    model: result.model,
    provider: result.provider,
    responseId: result.responseId,
  });
}

main().catch((error: unknown) => {
  console.error("Product description generation provider QA failed.", {
    exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    errorCode: safeErrorCode(error),
  });
  process.exitCode = 1;
});

function safeErrorCode(error: unknown): string {
  if (error instanceof ProductDescriptionGenerationError) return error.code;
  if (error instanceof ProductDescriptionGenerationOutputError) {
    return "product_description_generation_output_invalid";
  }
  if (error instanceof ProductDescriptionGenerationImageNotUsableError) {
    return "product_description_generation_image_not_usable";
  }
  if (!(error instanceof ProductDescriptionGenerationProviderError)) {
    return "product_description_generation_provider_failed";
  }
  if (error.kind === "configuration_invalid") {
    return "product_description_generation_configuration_invalid";
  }
  if (error.kind === "timeout") return "product_description_generation_provider_timeout";
  if (error.kind === "output_invalid") return "product_description_generation_output_invalid";
  return "product_description_generation_provider_failed";
}
