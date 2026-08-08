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

import { NewProductScreen } from "./new-product-screen";

it("requires a saved draft before product pictures can be added", async () => {
  const onSaved = vi.fn();
  render(<NewProductScreen onSaved={onSaved} />);

  expect(screen.getByRole("button", { name: "Save draft to add pictures" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

  expect(onSaved).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
});
