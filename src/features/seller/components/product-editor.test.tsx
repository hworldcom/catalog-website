import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductModerationMutationCoordinator } from "../product-moderation-mutation-coordinator";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  listCategories: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("@/features/seller/products.functions", () => ({
  saveMyProduct: mocks.save,
}));

vi.mock("@/features/seller/categories.functions", () => ({
  listProductCategories: mocks.listCategories,
}));

import { ProductEditor } from "./product-editor";

const productId = "00000000-0000-4000-8000-000000000001";
const productCategoryId = "00000000-0000-4000-8000-000000000002";
type ProductInitial = NonNullable<ComponentProps<typeof ProductEditor>["initial"]>;

const initial: ProductInitial = {
  id: productId,
  moderation_revision: 3,
  moderation_editable: true,
  title: "Model title",
  product_code: "SEL-F-TSH-ABCDEFGH",
  title_source: "model",
  description: null,
  audiences: ["women"],
  category_id: null,
  moq: null,
  pack_size: null,
  price: null,
  currency: "USD",
  stock: "in_stock",
  cover_image_url: null,
  trending: false,
  status: "draft",
};

describe("ProductEditor private draft behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCategories.mockResolvedValue({
      categories: [
        {
          id: productCategoryId,
          slug: "t-shirts",
          name: "T-shirts",
          parent_id: "00000000-0000-4000-8000-000000000003",
        },
      ],
    });
    mocks.save.mockResolvedValue(savedProduct(4));
  });

  it("renders product code as read-only metadata", () => {
    const persisted = renderEditor(initial);
    expect(screen.getByText("Product code:")).toBeVisible();
    expect(screen.getByText("SEL-F-TSH-ABCDEFGH")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /Product code/i })).not.toBeInTheDocument();

    persisted.unmount();
    renderEditor(null);
    expect(screen.queryByText("Product code:")).not.toBeInTheDocument();
  });

  it("saves an existing private draft without any publication intent", async () => {
    renderEditor(initial);

    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].data).toMatchObject({
      id: productId,
      expectedModerationRevision: 3,
      audiences: ["women"],
    });
    expect(mocks.save.mock.calls[0]?.[0].data).not.toHaveProperty("publish");
    expect(mocks.save.mock.calls[0]?.[0].data).not.toHaveProperty("title");
  });

  it("uses the shared coordinator revision as the exact write fence", async () => {
    const coordinator = coordinatorAt(7);
    renderEditor(initial, { mutationCoordinator: coordinator });

    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(coordinator.run).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].data.expectedModerationRevision).toBe(7);
  });

  it("keeps unsaved fields after a failed private save", async () => {
    mocks.save.mockRejectedValueOnce(new Error("temporary save failure"));
    renderEditor(initial);

    const title = screen.getByRole("textbox", { name: "Title" });
    const price = screen.getByRole("spinbutton", { name: "Price (per unit)" });
    await userEvent.clear(title);
    await userEvent.type(title, "Recovered title");
    await userEvent.type(price, "19.50");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(title).toHaveValue("Recovered title");
    expect(price).toHaveValue(19.5);
  });

  it("creates a never-approved draft without a revision fence", async () => {
    renderEditor(null);

    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].data).toMatchObject({ title: "", description: "" });
    expect(mocks.save.mock.calls[0]?.[0].data).not.toHaveProperty("expectedModerationRevision");
  });

  it("reports dirty state and applies a generated title without losing other fields", async () => {
    const onStateChange = vi.fn();
    const view = renderEditor(initial, { onStateChange });
    const packSize = screen.getByRole("textbox", { name: "Pack size" });
    await userEvent.type(packSize, "12 per box");

    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true })),
    );
    view.rerenderEditor({
      titleReplacement: {
        version: 1,
        snapshot: {
          productDraftId: productId,
          moderationRevision: 4,
          title: "Generated cotton shirt",
          titleSource: "model",
          productStatus: "draft",
          editable: true,
        },
      },
    });

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Generated cotton shirt");
    expect(packSize).toHaveValue("12 per box");
  });
});

function renderEditor(
  product: ProductInitial | null,
  props: Partial<ComponentProps<typeof ProductEditor>> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderUi = (nextProps: Partial<ComponentProps<typeof ProductEditor>> = props) => (
    <QueryClientProvider client={queryClient}>
      <ProductEditor initial={product} {...props} {...nextProps} />
    </QueryClientProvider>
  );
  const result = render(renderUi());
  return {
    ...result,
    rerenderEditor: (nextProps: Partial<ComponentProps<typeof ProductEditor>>) =>
      result.rerender(renderUi(nextProps)),
  };
}

function savedProduct(moderationRevision: number) {
  return {
    id: productId,
    title: "Model title",
    moderationRevision,
    titleSource: "model" as const,
    status: "draft" as const,
  };
}

function coordinatorAt(revision: number): ProductModerationMutationCoordinator {
  return {
    revision,
    busy: false,
    replaceRevision: vi.fn(),
    run: vi.fn(async (operation, revisionFromResult) => {
      const result = await operation(revision);
      revisionFromResult(result);
      return result;
    }),
  };
}
