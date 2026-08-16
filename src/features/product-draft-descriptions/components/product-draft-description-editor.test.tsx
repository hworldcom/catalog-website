import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  ProductDraftDescriptionEntry,
  ProductDraftDescriptionSnapshot,
} from "../product-draft-descriptions.types";
import {
  ProductDraftDescriptionEditor,
  type ProductDraftDescriptionEditorClient,
  type ProductDraftDescriptionEditorHandle,
} from "./product-draft-description-editor";

const productDraftId = "00000000-0000-4000-8000-000000000001";

describe("ProductDraftDescriptionEditor", () => {
  it("saves only changed languages and sends a normalized blank as an explicit clear", async () => {
    const update = vi.fn().mockResolvedValue(
      snapshot({
        en: entry("en", "Revised English description", "human"),
        pl: entry("pl", null, null),
      }),
    );
    const client = createClient({
      get: vi.fn().mockResolvedValue(
        snapshot({
          en: entry("en", "Original English description", "model"),
          pl: entry("pl", "Polski opis", "human"),
        }),
      ),
      update,
    });

    render(<ProductDraftDescriptionEditor productDraftId={productDraftId} client={client} />);

    const english = await screen.findByRole("textbox", { name: /English/i });
    const polish = screen.getByRole("textbox", { name: /Polish/i });
    await userEvent.clear(english);
    await userEvent.type(english, "  Revised English description  ");
    await userEvent.clear(polish);
    await userEvent.type(polish, "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save descriptions" }));

    expect(update).toHaveBeenCalledWith(
      productDraftId,
      {
        en: "Revised English description",
        pl: null,
      },
      3,
    );
    expect(await screen.findByText("Product descriptions were saved.")).toBeVisible();
  });

  it("reports dirty and saving state without exposing description generation", async () => {
    let finishSave!: (value: ProductDraftDescriptionSnapshot) => void;
    const update = vi.fn(
      () =>
        new Promise<ProductDraftDescriptionSnapshot>((resolve) => {
          finishSave = resolve;
        }),
    );
    const onStateChange = vi.fn();

    render(
      <ProductDraftDescriptionEditor
        productDraftId={productDraftId}
        client={createClient({ update })}
        onStateChange={onStateChange}
      />,
    );

    await userEvent.type(await screen.findByRole("textbox", { name: /English/i }), "Cotton shirt");
    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({ dirty: true, saving: false }),
    );
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save descriptions" }));
    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({ dirty: true, saving: true }),
    );

    finishSave(snapshot({ en: entry("en", "Cotton shirt", "human") }));
    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({ dirty: false, saving: false }),
    );
  });

  it("keeps descriptions read-only when the parent page disables editing", async () => {
    const client = createClient();
    render(
      <ProductDraftDescriptionEditor productDraftId={productDraftId} client={client} disabled />,
    );

    expect(await screen.findByRole("textbox", { name: /English/i })).toBeDisabled();
    expect(
      screen.getByText("Description editing is temporarily disabled while publication is active."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save descriptions" })).not.toBeInTheDocument();
    expect(client.update).not.toHaveBeenCalled();
  });

  it("refreshes metadata and untouched languages without discarding dirty text", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(
        snapshot({
          en: entry("en", "Initial English", "model"),
          pl: entry("pl", "Initial Polish", "model"),
        }),
      )
      .mockResolvedValueOnce(
        snapshot({
          en: { ...entry("en", "Server English", "model"), factsRevision: 2, outdated: false },
          pl: { ...entry("pl", "Server Polish", "model"), factsRevision: 2, outdated: false },
        }),
      );
    const ref = createRef<ProductDraftDescriptionEditorHandle>();
    render(
      <ProductDraftDescriptionEditor
        ref={ref}
        productDraftId={productDraftId}
        client={createClient({ get })}
      />,
    );

    const english = await screen.findByRole("textbox", { name: /English/i });
    await userEvent.clear(english);
    await userEvent.type(english, "Unsaved English");
    await act(async () => {
      await ref.current?.refresh();
    });

    expect(english).toHaveValue("Unsaved English");
    expect(screen.getByRole("textbox", { name: /Polish/i })).toHaveValue("Server Polish");
    expect(screen.getAllByText("Facts revision: 2").length).toBeGreaterThan(0);
  });
});

function createClient(
  overrides: Partial<ProductDraftDescriptionEditorClient> = {},
): ProductDraftDescriptionEditorClient {
  return {
    get: vi.fn().mockResolvedValue(snapshot()),
    update: vi.fn().mockResolvedValue(snapshot()),
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<
    Record<ProductDraftDescriptionEntry["language"], ProductDraftDescriptionEntry>
  > = {},
): ProductDraftDescriptionSnapshot {
  const entries = {
    pl: entry("pl"),
    en: entry("en"),
    de: entry("de"),
    vi: entry("vi"),
    ...overrides,
  };
  return {
    productDraftId,
    moderationRevision: 3,
    productStatus: "draft",
    currentFactsRevision: 1,
    generationEligibility: { eligible: true, reason: null },
    descriptions: [entries.pl, entries.en, entries.de, entries.vi],
  };
}

function entry(
  language: ProductDraftDescriptionEntry["language"],
  text: string | null = null,
  source: ProductDraftDescriptionEntry["source"] = null,
): ProductDraftDescriptionEntry {
  return {
    language,
    text,
    source,
    factsRevision: source ? 1 : null,
    provider: null,
    model: null,
    pipelineVersion: null,
    generatedAt: null,
    updatedAt: source ? "2026-07-31T12:00:00Z" : null,
    outdated: false,
  };
}
