import { describe, expect, it } from "vitest";

import { readProductDescriptionGenerationConfig } from "./product-draft-description-generation.config";

describe("readProductDescriptionGenerationConfig", () => {
  it("requires a server API key and an explicit model", () => {
    expect(() => readProductDescriptionGenerationConfig({})).toThrowError(
      expect.objectContaining({
        code: "product_description_generation_configuration_invalid",
      }),
    );
  });

  it("returns trimmed-exact valid configuration without a model default", () => {
    expect(
      readProductDescriptionGenerationConfig({
        OPENAI_API_KEY: "sk-test-12345678901234567890",
        BAZORIA_DESCRIPTION_GENERATION_MODEL: "gpt-5.4-nano",
      }),
    ).toEqual({
      apiKey: "sk-test-12345678901234567890",
      model: "gpt-5.4-nano",
    });
  });

  it("rejects whitespace-bearing secrets or model identifiers", () => {
    expect(() =>
      readProductDescriptionGenerationConfig({
        OPENAI_API_KEY: " sk-test-12345678901234567890",
        BAZORIA_DESCRIPTION_GENERATION_MODEL: "gpt-5.4-nano",
      }),
    ).toThrowError(expect.objectContaining({ statusCode: 500 }));
  });
});
