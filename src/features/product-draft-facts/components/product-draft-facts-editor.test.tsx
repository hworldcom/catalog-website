import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ProductDraftFacts, ProductDraftFactsSnapshot } from "../product-draft-facts.types";
import {
  ProductDraftFactsEditorView,
  type ProductDraftFactsEditorClient,
} from "./product-draft-facts-editor";

const productDraftId = "00000000-0000-0000-0000-000000000001";

const canonicalFacts: ProductDraftFacts = {
  schemaVersion: 2,
  colors: [],
  materialComposition: null,
  uncertainFields: [],
  fieldSources: {
    colors: null,
    materialComposition: null,
  },
};

function snapshot(overrides: Partial<ProductDraftFactsSnapshot> = {}): ProductDraftFactsSnapshot {
  return {
    productDraftId,
    facts: canonicalFacts,
    factsRevision: 1,
    updatedAt: "2026-07-24T12:00:00Z",
    productStatus: "draft",
    editable: true,
    ...overrides,
  };
}

function client(overrides: Partial<ProductDraftFactsEditorClient> = {}) {
  return {
    get: vi.fn().mockResolvedValue(snapshot()),
    update: vi.fn().mockResolvedValue(snapshot()),
    ...overrides,
  } satisfies ProductDraftFactsEditorClient;
}

describe("ProductDraftFactsEditorView", () => {
  it("loads canonical empty facts with Save disabled", async () => {
    const testClient = client();
    render(<ProductDraftFactsEditorView productDraftId={productDraftId} client={testClient} />);

    expect(screen.getByText("Loading product facts…")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Optional product details" })).toBeVisible();
    expect(screen.getByLabelText("Colors")).toHaveValue("");
    expect(screen.getByLabelText("Material composition")).toHaveValue("");
    expect(screen.queryByLabelText("Product type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Fit")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save facts" })).toBeDisabled();
    expect(testClient.get).toHaveBeenCalledWith(productDraftId);
  });

  it("sends only changed fields and replaces the form with the server snapshot", async () => {
    const nextFacts: ProductDraftFacts = {
      ...canonicalFacts,
      colors: ["black", "red"],
      materialComposition: "cotton",
      fieldSources: {
        ...canonicalFacts.fieldSources,
        colors: "human",
        materialComposition: "human",
      },
    };
    const update = vi.fn().mockResolvedValue(
      snapshot({
        facts: nextFacts,
        factsRevision: 2,
        updatedAt: "2026-07-24T13:00:00Z",
      }),
    );
    const testClient = client({ update });
    render(<ProductDraftFactsEditorView productDraftId={productDraftId} client={testClient} />);

    await userEvent.type(await screen.findByLabelText("Colors"), " black \n\n red ");
    await userEvent.type(screen.getByLabelText("Material composition"), " cotton ");
    await userEvent.click(screen.getByRole("button", { name: "Save facts" }));

    expect(update).toHaveBeenCalledWith(productDraftId, {
      colors: ["black", "red"],
      materialComposition: "cotton",
    });
    expect(await screen.findByText("Product facts were saved.")).toBeVisible();
    expect(screen.getByLabelText("Colors")).toHaveValue("black\nred");
    expect(screen.getByLabelText("Material composition")).toHaveValue("cotton");
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save facts" })).toBeDisabled();
  });

  it("reports dirty and saving state to the page coordinator", async () => {
    let finishSave!: (value: ProductDraftFactsSnapshot) => void;
    const update = vi.fn(
      () =>
        new Promise<ProductDraftFactsSnapshot>((resolve) => {
          finishSave = resolve;
        }),
    );
    const onStateChange = vi.fn();
    render(
      <ProductDraftFactsEditorView
        productDraftId={productDraftId}
        client={client({ update })}
        onStateChange={onStateChange}
      />,
    );

    await userEvent.type(await screen.findByLabelText("Material composition"), "cotton");
    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({ dirty: true, saving: false }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Save facts" }));
    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({ dirty: true, saving: true }),
    );

    finishSave(
      snapshot({
        facts: { ...canonicalFacts, materialComposition: "cotton" },
      }),
    );
    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({ dirty: false, saving: false }),
    );
  });

  it("sends explicit scalar and list clears", async () => {
    const existingFacts: ProductDraftFacts = {
      ...canonicalFacts,
      colors: ["black"],
      materialComposition: "cotton",
    };
    const update = vi.fn().mockResolvedValue(snapshot());
    const testClient = client({
      get: vi.fn().mockResolvedValue(snapshot({ facts: existingFacts })),
      update,
    });
    render(<ProductDraftFactsEditorView productDraftId={productDraftId} client={testClient} />);

    await userEvent.clear(await screen.findByLabelText("Colors"));
    await userEvent.clear(screen.getByLabelText("Material composition"));
    await userEvent.click(screen.getByRole("button", { name: "Save facts" }));

    expect(update).toHaveBeenCalledWith(productDraftId, {
      colors: [],
      materialComposition: null,
    });
  });

  it("preserves unsaved facts after a temporary save failure", async () => {
    const update = vi.fn().mockRejectedValue(new Error("temporary database failure"));
    render(
      <ProductDraftFactsEditorView productDraftId={productDraftId} client={client({ update })} />,
    );

    const colors = await screen.findByLabelText("Colors");
    const materialComposition = screen.getByLabelText("Material composition");
    await userEvent.type(colors, "black\nred");
    await userEvent.type(materialComposition, "cotton");
    await userEvent.click(screen.getByRole("button", { name: "Save facts" }));

    expect(await screen.findByText("Product facts are temporarily unavailable.")).toBeVisible();
    expect(colors).toHaveValue("black\nred");
    expect(materialComposition).toHaveValue("cotton");
    expect(screen.getByRole("button", { name: "Save facts" })).toBeEnabled();
  });

  it("disables Save again when a touched value is reverted", async () => {
    const existingFacts = { ...canonicalFacts, materialComposition: "cotton" };
    const testClient = client({
      get: vi.fn().mockResolvedValue(snapshot({ facts: existingFacts })),
    });
    render(<ProductDraftFactsEditorView productDraftId={productDraftId} client={testClient} />);

    const materialComposition = await screen.findByLabelText("Material composition");
    await userEvent.clear(materialComposition);
    await userEvent.type(materialComposition, " cotton ");

    expect(screen.getByRole("button", { name: "Save facts" })).toBeDisabled();
  });

  it("shows field sources and existing uncertainty without editing uncertainty", async () => {
    const suggestedFacts: ProductDraftFacts = {
      ...canonicalFacts,
      materialComposition: "cotton",
      uncertainFields: ["materialComposition"],
      fieldSources: { ...canonicalFacts.fieldSources, materialComposition: "model" },
    };
    const testClient = client({
      get: vi.fn().mockResolvedValue(snapshot({ facts: suggestedFacts })),
    });
    render(<ProductDraftFactsEditorView productDraftId={productDraftId} client={testClient} />);

    expect(await screen.findByText("Uncertain")).toBeVisible();
    expect(screen.getByText("Source: Model suggestion")).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders published facts read-only", async () => {
    const testClient = client({
      get: vi.fn().mockResolvedValue(
        snapshot({
          productStatus: "published",
          editable: false,
        }),
      ),
    });
    render(<ProductDraftFactsEditorView productDraftId={productDraftId} client={testClient} />);

    expect(await screen.findByText("Facts are read-only")).toBeVisible();
    expect(screen.getByLabelText("Colors")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save facts" })).not.toBeInTheDocument();
  });

  it("renders stable load errors and retries", async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce({ code: "product_draft_not_found" })
      .mockResolvedValueOnce(snapshot());
    const testClient = client({ get });
    render(<ProductDraftFactsEditorView productDraftId={productDraftId} client={testClient} />);

    expect(
      await screen.findByText(
        "This ProductDraft was not found or is not available to your account.",
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Optional product details" })).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("shows a no-longer-editable error and refreshes into read-only state", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ productStatus: "archived", editable: false }));
    const update = vi.fn().mockRejectedValue({ code: "product_draft_facts_not_editable" });
    const testClient = client({ get, update });
    render(<ProductDraftFactsEditorView productDraftId={productDraftId} client={testClient} />);

    await userEvent.type(await screen.findByLabelText("Material composition"), "cotton");
    await userEvent.click(screen.getByRole("button", { name: "Save facts" }));

    expect(
      await screen.findByText("This ProductDraft is no longer editable because it is not a draft."),
    ).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText("Material composition")).toBeDisabled());
    expect(screen.queryByRole("button", { name: "Save facts" })).not.toBeInTheDocument();
  });
});
