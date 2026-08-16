import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ProductDraftTitleSnapshot } from "../product-draft-title.types";
import {
  ProductDraftTitleEditorView,
  type ProductDraftTitleEditorClient,
} from "./product-draft-title-editor";

const productDraftId = "00000000-0000-4000-8000-000000000001";

function snapshot(overrides: Partial<ProductDraftTitleSnapshot> = {}): ProductDraftTitleSnapshot {
  return {
    productDraftId,
    moderationRevision: 3,
    title: "Draft title",
    titleSource: "human",
    productStatus: "draft",
    editable: true,
    ...overrides,
  };
}

function client(overrides: Partial<ProductDraftTitleEditorClient> = {}) {
  return {
    get: vi.fn().mockResolvedValue(snapshot()),
    update: vi.fn().mockResolvedValue(snapshot()),
    ...overrides,
  } satisfies ProductDraftTitleEditorClient;
}

describe("ProductDraftTitleEditorView", () => {
  it("loads the title and source with Save disabled", async () => {
    const testClient = client();
    render(<ProductDraftTitleEditorView productDraftId={productDraftId} client={testClient} />);

    expect(screen.getByText("Loading product title…")).toBeVisible();
    expect(await screen.findByLabelText("Product title")).toHaveValue("Draft title");
    expect(screen.getByText("Source: Human")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save title" })).toBeDisabled();
  });

  it("normalizes a changed title and replaces local state from the response", async () => {
    const onSnapshot = vi.fn();
    const update = vi.fn().mockResolvedValue(
      snapshot({
        title: "Black trousers",
      }),
    );
    const testClient = client({ update });
    render(
      <ProductDraftTitleEditorView
        productDraftId={productDraftId}
        client={testClient}
        onSnapshot={onSnapshot}
      />,
    );

    const input = await screen.findByLabelText("Product title");
    await userEvent.clear(input);
    await userEvent.type(input, "  Black   trousers  ");
    await userEvent.click(screen.getByRole("button", { name: "Save title" }));

    expect(update).toHaveBeenCalledWith(productDraftId, "  Black   trousers  ", 3);
    expect(await screen.findByText("Product title was saved.")).toBeVisible();
    expect(input).toHaveValue("Black trousers");
    expect(onSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Black trousers" }),
    );
  });

  it("allows an explicit clear and shows a null source response", async () => {
    const update = vi.fn().mockResolvedValue(
      snapshot({
        title: "",
        titleSource: null,
      }),
    );
    const testClient = client({ update });
    render(<ProductDraftTitleEditorView productDraftId={productDraftId} client={testClient} />);

    await userEvent.clear(await screen.findByLabelText("Product title"));
    await userEvent.click(screen.getByRole("button", { name: "Save title" }));

    expect(update).toHaveBeenCalledWith(productDraftId, "", 3);
    expect(await screen.findByText("Source: Not set")).toBeVisible();
  });

  it("rejects an overlength normalized title before calling the server", async () => {
    const testClient = client();
    render(<ProductDraftTitleEditorView productDraftId={productDraftId} client={testClient} />);

    const input = await screen.findByLabelText("Product title");
    await userEvent.clear(input);
    await userEvent.type(input, "x".repeat(51));
    await userEvent.click(screen.getByRole("button", { name: "Save title" }));

    expect(screen.getByText("Enter at most 50 characters.")).toBeVisible();
    expect(testClient.update).not.toHaveBeenCalled();
    expect(input).toHaveValue("x".repeat(51));
  });

  it("renders published and archived titles read-only", async () => {
    for (const productStatus of ["published", "archived"] as const) {
      const { unmount } = render(
        <ProductDraftTitleEditorView
          productDraftId={productDraftId}
          client={client({
            get: vi.fn().mockResolvedValue(
              snapshot({
                productStatus,
                editable: false,
              }),
            ),
          })}
        />,
      );

      expect(await screen.findByLabelText("Product title")).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Save title" })).not.toBeInTheDocument();
      expect(
        screen.getByText("The title is read-only after the ProductDraft leaves draft status."),
      ).toBeVisible();
      unmount();
    }
  });

  it("shows stable server failures without replacing the loaded value", async () => {
    const update = vi.fn().mockRejectedValue({
      code: "product_draft_title_not_editable",
    });
    const testClient = client({ update });
    render(<ProductDraftTitleEditorView productDraftId={productDraftId} client={testClient} />);

    const input = await screen.findByLabelText("Product title");
    await userEvent.clear(input);
    await userEvent.type(input, "Changed");
    await userEvent.click(screen.getByRole("button", { name: "Save title" }));

    expect(await screen.findByText("This ProductDraft title is no longer editable.")).toBeVisible();
    expect(input).toHaveValue("Changed");
  });

  it("recognizes a stable server message when a transport wrapper drops the code", async () => {
    const update = vi.fn().mockRejectedValue(new Error("The ProductDraft title is invalid."));
    const testClient = client({ update });
    render(<ProductDraftTitleEditorView productDraftId={productDraftId} client={testClient} />);

    const input = await screen.findByLabelText("Product title");
    await userEvent.clear(input);
    await userEvent.type(input, "Changed");
    await userEvent.click(screen.getByRole("button", { name: "Save title" }));

    expect(await screen.findByText("Enter at most 50 characters.")).toBeVisible();
  });
});
