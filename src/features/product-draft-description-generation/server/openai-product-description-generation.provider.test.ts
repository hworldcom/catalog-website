import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import {
  buildProviderInput,
  OpenAIProductDescriptionGenerationProvider,
  PRODUCT_DESCRIPTION_GENERATION_INSTRUCTIONS,
} from "./openai-product-description-generation.provider";

const config = {
  apiKey: "sk-test-12345678901234567890",
  model: "configured-model",
};

describe("OpenAIProductDescriptionGenerationProvider", () => {
  it("sends one strict four-language Responses request with the style contract", async () => {
    const parse = vi.fn(async (_request: unknown, _options?: unknown) => completedResponse());
    const provider = new OpenAIProductDescriptionGenerationProvider(config, {
      responses: { parse },
    } as unknown as OpenAI);

    const result = await provider.generate(providerInput(), new AbortController().signal);

    expect(parse).toHaveBeenCalledOnce();
    const request = parse.mock.calls[0]?.[0] as {
      instructions: string;
      input: Array<{
        role: string;
        content: Array<
          | { type: "input_image"; image_url: string; detail: string }
          | { type: "input_text"; text: string }
        >;
      }>;
    };
    expect(request).toMatchObject({
      model: "configured-model",
      reasoning: { effort: "none" },
      max_output_tokens: 6000,
      store: false,
    });
    expect(request.instructions).toBe(PRODUCT_DESCRIPTION_GENERATION_INSTRUCTIONS);
    expect(request.instructions).toContain("describe the specific product visible in the image");
    expect(request.instructions).toContain("do not define or describe the category in general");
    expect(request.instructions).toContain("Do not infer fiber composition");
    expect(request.instructions).toContain("at most 300 Unicode characters");
    expect(request.instructions).toContain("at most 50 Unicode characters");
    expect(request.input[0]?.content[0]).toEqual({
      type: "input_image",
      image_url: "data:image/jpeg;base64,/9j/2Q==",
      detail: "high",
    });
    const textInput = request.input[0]?.content[1];
    expect(textInput?.type).toBe("input_text");
    expect(JSON.parse(textInput?.type === "input_text" ? textInput.text : "")).toEqual({
      category: { slug: "t-shirts", name: "T-shirts" },
      reviewedFacts: {
        schemaVersion: 2,
        uncertainFields: ["materialComposition"],
        colors: ["Blue"],
        fieldSources: { colors: "human" },
      },
      titleProposalRequested: true,
    });
    expect(result).toMatchObject({
      provider: "openai",
      model: "configured-model",
      responseId: "resp_1",
    });
  });

  it("maps a refusal to a provider failure", async () => {
    const parse = vi.fn(async (_request: unknown, _options?: unknown) => ({
      ...completedResponse(),
      output: [{ type: "message", content: [{ type: "refusal" }] }],
      output_parsed: null,
    }));
    const provider = new OpenAIProductDescriptionGenerationProvider(config, {
      responses: { parse },
    } as unknown as OpenAI);

    await expect(
      provider.generate(providerInput(), new AbortController().signal),
    ).rejects.toMatchObject({ kind: "failed" });
  });

  it("maps incomplete and absent parsed output to invalid output", async () => {
    const parse = vi.fn(async (_request: unknown, _options?: unknown) => ({
      ...completedResponse(),
      status: "incomplete",
      output_parsed: null,
    }));
    const provider = new OpenAIProductDescriptionGenerationProvider(config, {
      responses: { parse },
    } as unknown as OpenAI);

    await expect(
      provider.generate(providerInput(), new AbortController().signal),
    ).rejects.toMatchObject({
      kind: "output_invalid",
    });
  });

  it("maps an aborted request to a timeout", async () => {
    const parse = vi.fn(async (_request: unknown, _options?: unknown) => {
      throw new DOMException("Aborted", "AbortError");
    });
    const provider = new OpenAIProductDescriptionGenerationProvider(config, {
      responses: { parse },
    } as unknown as OpenAI);

    await expect(
      provider.generate(providerInput(), new AbortController().signal),
    ).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("buildProviderInput", () => {
  it("omits empty and null facts while retaining uncertainty", () => {
    expect(
      buildProviderInput({
        ...providerInput(),
        facts: {
          schemaVersion: 2,
          colors: [],
          materialComposition: null,
          uncertainFields: ["colors", "materialComposition"],
          fieldSources: { colors: null, materialComposition: null },
        },
      }),
    ).toEqual({
      category: { slug: "t-shirts", name: "T-shirts" },
      reviewedFacts: {
        schemaVersion: 2,
        uncertainFields: ["colors", "materialComposition"],
      },
      titleProposalRequested: true,
    });
  });
});

function providerInput() {
  return {
    category: {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "t-shirts",
      name: "T-shirts",
    },
    facts: {
      schemaVersion: 2 as const,
      colors: ["Blue"],
      materialComposition: null,
      uncertainFields: ["materialComposition" as const],
      fieldSources: { colors: "human" as const, materialComposition: null },
    },
    coverImage: {
      mediaType: "image/jpeg" as const,
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    },
    titleProposalRequested: true,
  };
}

function completedResponse() {
  return {
    id: "resp_1",
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text" }] }],
    output_parsed: {
      imageAssessment: {
        usable: true,
        observedDetails: ["Blue short-sleeve top"],
      },
      descriptions: {
        pl: "Polski opis.",
        en: "English description.",
        de: "Deutsche Beschreibung.",
        vi: "Mo ta tieng Viet.",
      },
      titleProposal: "Cotton T-shirt",
    },
  };
}
