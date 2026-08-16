import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

vi.mock("../components/product-editor", () => ({
  ProductEditor: ({ onSaved }: { onSaved?: (id: string) => void }) => (
    <button type="button" onClick={() => onSaved?.("00000000-0000-4000-8000-000000000001")}>
      Save draft
    </button>
  ),
}));

vi.mock("./edit-product-screen", () => ({
  EditProductScreen: ({ productId }: { productId: string }) => (
    <div>Picture uploader ready for {productId}</div>
  ),
}));

import { NewProductScreen } from "./new-product-screen";

it("opens the saved draft editor immediately so pictures can be added", async () => {
  const onSaved = vi.fn();
  render(<NewProductScreen onSaved={onSaved} />);

  expect(
    screen.getByText("Save the draft once. The picture uploader will open here immediately."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save draft to add pictures" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

  expect(onSaved).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
  expect(
    screen.getByText("Picture uploader ready for 00000000-0000-4000-8000-000000000001"),
  ).toBeInTheDocument();
});
