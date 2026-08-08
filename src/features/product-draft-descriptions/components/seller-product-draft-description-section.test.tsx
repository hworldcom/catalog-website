import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ProductDraftDescriptionEntry,
  ProductDraftDescriptionSnapshot,
} from "../product-draft-descriptions.types";
import {
  SellerProductDraftDescriptionSectionView,
  type SellerDescriptionCoordinationState,
  type SellerProductDraftDescriptionClient,
} from "./seller-product-draft-description-section";

const productDraftId = uuid(1);
const cleanCoordination: SellerDescriptionCoordinationState = {
  product: { dirty: false, saving: false, publicationActive: false },
  facts: { dirty: false, saving: false },
};

afterEach(() => vi.restoreAllMocks());

describe("SellerProductDraftDescriptionSection", () => {
  it("generates only after an explicit action and applies the complete result", async () => {
    const generated = snapshot({
      pl: modelEntry("pl", "Polski opis"),
      en: modelEntry("en", "English description"),
      de: modelEntry("de", "Deutsche Beschreibung"),
      vi: modelEntry("vi", "Mo ta tieng Viet"),
    });
    const client = createClient({
      generate: vi.fn().mockResolvedValue({
        descriptionSnapshot: generated,
        titleSnapshot: titleSnapshot("Cotton T-shirt", "model"),
      }),
    });
    const onGenerated = vi.fn();
    const onGenerationStateChange = vi.fn();

    renderSection({ client, title: "", onGenerated, onGenerationStateChange });

    const generateButton = await screen.findByRole("button", {
      name: "Generate title and descriptions",
    });
    await waitFor(() => expect(generateButton).toBeEnabled());
    expect(client.generate).not.toHaveBeenCalled();
    await userEvent.click(generateButton);

    await waitFor(() => expect(client.generate).toHaveBeenCalledOnce());
    expect(onGenerationStateChange).toHaveBeenCalledWith(true);
    expect(onGenerationStateChange).toHaveBeenLastCalledWith(false);
    expect(onGenerated).toHaveBeenCalledWith({
      descriptionSnapshot: generated,
      titleSnapshot: titleSnapshot("Cotton T-shirt", "model"),
    });
    expect(screen.getByRole("textbox", { name: /English/i })).toHaveValue("English description");
    expect(screen.getByText("Model-generated text is unreviewed draft content.")).toBeVisible();
  });

  it("asks before regeneration and makes no request when the seller cancels", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const client = createClient({
      get: vi.fn().mockResolvedValue(snapshot({ en: modelEntry("en", "Existing text") })),
    });
    renderSection({ client, title: "Existing title" });

    await userEvent.click(await screen.findByRole("button", { name: "Generate descriptions" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(client.generate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "unsaved product fields",
      { ...cleanCoordination, product: { ...cleanCoordination.product, dirty: true } },
      "Save product changes before generating descriptions.",
    ],
    [
      "unsaved facts",
      { ...cleanCoordination, facts: { dirty: true, saving: false } },
      "Save product facts before generating descriptions.",
    ],
    [
      "active publication",
      {
        ...cleanCoordination,
        product: { ...cleanCoordination.product, publicationActive: true },
      },
      "Wait for product publication to finish.",
    ],
  ])("disables generation for %s", async (_label, coordination, reason) => {
    renderSection({ coordination });

    expect(await screen.findByText(reason)).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate descriptions" })).toBeDisabled();
  });

  it("disables generation when all descriptions and the title are human-owned", async () => {
    const human = snapshot({
      pl: humanEntry("pl", "Polski"),
      en: humanEntry("en", "English"),
      de: humanEntry("de", "Deutsch"),
      vi: humanEntry("vi", "Tieng Viet"),
    });
    renderSection({
      title: "Human title",
      client: createClient({ get: vi.fn().mockResolvedValue(human) }),
    });

    expect(
      await screen.findByText("All descriptions are human-edited and the title is already set."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate descriptions" })).toBeDisabled();
  });

  it("preserves current text after a retryable provider failure", async () => {
    const client = createClient({
      generate: vi.fn().mockRejectedValue({
        code: "product_description_generation_provider_timeout",
      }),
    });
    renderSection({ client });
    const english = await screen.findByRole("textbox", { name: /English/i });

    await userEvent.click(screen.getByRole("button", { name: "Generate descriptions" }));

    expect(
      await screen.findByText(
        "Descriptions could not be generated. Your current text was preserved. Try again.",
      ),
    ).toBeVisible();
    expect(english).toHaveValue("");
  });

  it("refreshes product, facts, and descriptions after an input-change conflict", async () => {
    const refreshed = snapshot({ en: modelEntry("en", "Newer English") });
    const client = createClient({
      get: vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(refreshed),
      generate: vi.fn().mockRejectedValue({
        code: "product_description_generation_input_changed",
      }),
    });
    const onRefreshContext = vi.fn().mockResolvedValue(undefined);
    renderSection({ client, onRefreshContext });

    await userEvent.click(await screen.findByRole("button", { name: "Generate descriptions" }));

    await waitFor(() => expect(onRefreshContext).toHaveBeenCalledWith("product_and_facts"));
    expect(screen.getByRole("textbox", { name: /English/i })).toHaveValue("Newer English");
    expect(client.generate).toHaveBeenCalledOnce();
  });

  it("keeps generation disabled for the page session after invalid configuration", async () => {
    const client = createClient({
      generate: vi.fn().mockRejectedValue({
        code: "product_description_generation_configuration_invalid",
      }),
    });
    renderSection({ client });

    await userEvent.click(await screen.findByRole("button", { name: "Generate descriptions" }));

    expect(
      (await screen.findAllByText("Description generation is temporarily unavailable."))[0],
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate descriptions" })).toBeDisabled();
  });
});

function renderSection(
  overrides: Partial<Parameters<typeof SellerProductDraftDescriptionSectionView>[0]> = {},
) {
  return render(
    <SellerProductDraftDescriptionSectionView
      productDraftId={productDraftId}
      title="Existing title"
      client={createClient()}
      coordination={cleanCoordination}
      refreshRequest={0}
      onDescriptionStateChange={vi.fn()}
      onGenerationStateChange={vi.fn()}
      onGenerated={vi.fn()}
      onRefreshContext={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />,
  );
}

function createClient(
  overrides: Partial<SellerProductDraftDescriptionClient> = {},
): SellerProductDraftDescriptionClient & {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  generate: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockResolvedValue(snapshot()),
    update: vi.fn().mockResolvedValue(snapshot()),
    generate: vi.fn().mockResolvedValue({
      descriptionSnapshot: snapshot(),
      titleSnapshot: titleSnapshot("", null),
    }),
    ...overrides,
  } as SellerProductDraftDescriptionClient & {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
  };
}

function snapshot(
  overrides: Partial<
    Record<ProductDraftDescriptionEntry["language"], ProductDraftDescriptionEntry>
  > = {},
): ProductDraftDescriptionSnapshot {
  const entries = {
    pl: missingEntry("pl"),
    en: missingEntry("en"),
    de: missingEntry("de"),
    vi: missingEntry("vi"),
    ...overrides,
  };
  return {
    productDraftId,
    productStatus: "draft",
    currentFactsRevision: 2,
    generationEligibility: { eligible: true, reason: null },
    descriptions: [entries.pl, entries.en, entries.de, entries.vi],
  };
}

function missingEntry(
  language: ProductDraftDescriptionEntry["language"],
): ProductDraftDescriptionEntry {
  return {
    language,
    text: null,
    source: null,
    factsRevision: null,
    provider: null,
    model: null,
    pipelineVersion: null,
    generatedAt: null,
    updatedAt: null,
    outdated: null,
  };
}

function modelEntry(
  language: ProductDraftDescriptionEntry["language"],
  text: string,
): ProductDraftDescriptionEntry {
  return {
    ...missingEntry(language),
    text,
    source: "model",
    factsRevision: 2,
    provider: "openai",
    model: "configured-model",
    pipelineVersion: "product-description-v1",
    generatedAt: "2026-08-02T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
    outdated: false,
  };
}

function humanEntry(
  language: ProductDraftDescriptionEntry["language"],
  text: string,
): ProductDraftDescriptionEntry {
  return {
    ...modelEntry(language, text),
    source: "human",
    provider: null,
    model: null,
    pipelineVersion: null,
    generatedAt: null,
  };
}

function titleSnapshot(title: string, titleSource: "human" | "model" | null) {
  return {
    productDraftId,
    title,
    titleSource,
    productStatus: "draft" as const,
    editable: true,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
