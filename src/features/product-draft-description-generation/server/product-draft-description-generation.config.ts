import {
  generationError,
  PRODUCT_DESCRIPTION_CLAIM_EXPIRY_SECONDS,
  PRODUCT_DESCRIPTION_PROVIDER_TIMEOUT_MS,
} from "../product-draft-description-generation.types";

export type ProductDescriptionGenerationConfig = {
  apiKey: string;
  model: string;
};

export function readProductDescriptionGenerationConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ProductDescriptionGenerationConfig {
  assertClaimTimeoutBudget();

  const apiKey = readNonblankValue(environment.OPENAI_API_KEY);
  const model = readNonblankValue(environment.BAZORIA_DESCRIPTION_GENERATION_MODEL);
  if (!apiKey || apiKey.length < 20 || /\s/u.test(apiKey) || !model || /\s/u.test(model)) {
    throw generationError(
      500,
      "product_description_generation_configuration_invalid",
      "Product description generation is not configured correctly.",
    );
  }

  return { apiKey, model };
}

export function assertClaimTimeoutBudget(): void {
  const claimExpiryMs = PRODUCT_DESCRIPTION_CLAIM_EXPIRY_SECONDS * 1_000;
  if (claimExpiryMs < PRODUCT_DESCRIPTION_PROVIDER_TIMEOUT_MS + 120_000) {
    throw generationError(
      500,
      "product_description_generation_configuration_invalid",
      "Product description generation has an invalid timeout configuration.",
    );
  }
}

function readNonblankValue(value: string | undefined): string | null {
  if (value === undefined || value.trim() !== value || value.length === 0) return null;
  return value;
}
