import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  listCategories: vi.fn(),
  getPublication: vi.fn(),
  publish: vi.fn(),
  retryPublication: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/features/seller/products.functions", () => ({
  saveMyProduct: mocks.save,
}));

vi.mock("@/features/seller/product-publication.functions", () => ({
  getMyProductPublication: mocks.getPublication,
  publishMyProduct: mocks.publish,
  retryMyProductPublication: mocks.retryPublication,
}));

vi.mock("@/features/seller/categories.functions", () => ({
  listCategoriesForPicker: mocks.listCategories,
}));

vi.mock("./image-upload", () => ({
  ImageUpload: () => <div>Image upload</div>,
}));

import { ProductEditor } from "./product-editor";

const productId = "00000000-0000-4000-8000-000000000001";

type InitialProduct = {
  id: string;
  title: string;
  title_source: "human" | "model" | null;
  description: string | null;
  category_id: string | null;
  moq: number | null;
  pack_size: string | null;
  price: number | string | null;
  currency: string;
  stock: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
  cover_image_url: string | null;
  trending: boolean;
  status: "draft" | "published" | "archived";
  imagePublicationMode?: "imported" | "direct";
};

const initial: InitialProduct = {
  id: productId,
  title: "Model title",
  title_source: "model" as const,
  description: null,
  category_id: null,
  moq: null,
  pack_size: null,
  price: null,
  currency: "USD",
  stock: "in_stock" as const,
  cover_image_url: null,
  trending: false,
  status: "draft" as const,
};

describe("ProductEditor title and description behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCategories.mockResolvedValue({ categories: [] });
    mocks.save.mockResolvedValue({
      id: productId,
      title: "Model title",
      titleSource: "model",
      status: "draft",
    });
    mocks.getPublication.mockResolvedValue(publication("not_started"));
    mocks.publish.mockResolvedValue(publication("pending"));
    mocks.retryPublication.mockResolvedValue(publication("pending"));
  });

  it("omits an untouched existing title", async () => {
    renderEditor(initial);
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].data).not.toHaveProperty("title");
  });

  it("includes a changed or explicitly cleared title", async () => {
    renderEditor(initial);
    const input = screen.getByRole("textbox", { name: "Title" });

    await userEvent.clear(input);
    await userEvent.type(input, "Human title");
    mocks.save.mockResolvedValueOnce({
      id: productId,
      title: "Human title",
      titleSource: "human",
      status: "draft",
    });
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(mocks.save.mock.calls[0]?.[0].data).toMatchObject({
        title: "Human title",
      }),
    );

    await userEvent.clear(input);
    mocks.save.mockResolvedValueOnce({
      id: productId,
      title: "",
      titleSource: null,
      status: "draft",
    });
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1]?.[0].data).toMatchObject({ title: "" });
  });

  it("always includes the title value when creating a draft", async () => {
    mocks.save.mockResolvedValueOnce({
      id: productId,
      title: "",
      titleSource: null,
      status: "draft",
    });
    renderEditor(null);

    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].data).toMatchObject({ title: "" });
    expect(mocks.save.mock.calls[0]?.[0].data).toHaveProperty("description", "");
  });

  it("invalidates the paginated list and summary when creating a product", async () => {
    const { queryClient } = renderEditor(null);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-products"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-product-summary"] });
  });

  it("omits an untouched existing description and includes a changed or cleared one", async () => {
    renderEditor({ ...initial, description: "Model description" });
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].data).not.toHaveProperty("description");

    const description = screen.getByRole("textbox", { name: "Description" });
    await userEvent.clear(description);
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1]?.[0].data).toMatchObject({ description: "" });
  });

  it.each(["published", "archived"] as const)(
    "makes a %s ProductDraft title read-only",
    async (status) => {
      renderEditor({ ...initial, status });
      expect(screen.getByRole("textbox", { name: "Title" })).toBeDisabled();
      expect(screen.getByRole("textbox", { name: "Description" })).toBeDisabled();
    },
  );

  it("hides and omits the manual cover for an imported ProductDraft", async () => {
    renderEditor({
      ...initial,
      imagePublicationMode: "imported",
      cover_image_url: "https://public.example/stale.jpg",
    });

    expect(screen.queryByText("Image upload")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1));
    expect(mocks.publish.mock.calls[0]?.[0].data).not.toHaveProperty("cover_image_url");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(await screen.findByText("Publishing product and images")).toBeInTheDocument();
  });

  it("keeps the direct cover control and uses synchronous publication", async () => {
    mocks.publish.mockResolvedValueOnce({
      ...publication("not_required"),
      productStatus: "published",
      publicProductUrl: `/p/${productId}`,
    });
    renderEditor({ ...initial, imagePublicationMode: "direct" });

    expect(screen.getByText("Image upload")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(mocks.publish.mock.calls[0]?.[0].data).toHaveProperty("cover_image_url", ""),
    );
  });

  it("blocks publication while optional facts are dirty", async () => {
    renderEditor({ ...initial, imagePublicationMode: "imported" }, { dirty: true, saving: false });

    expect(screen.getByText("Save optional product details before publishing.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("shows a server-approved retry for a failed durable run", async () => {
    mocks.getPublication.mockResolvedValueOnce({
      ...publication("failed"),
      errorCode: "product_publication_transfer_failed",
      retryAllowed: true,
    });
    renderEditor({ ...initial, imagePublicationMode: "imported" });

    await userEvent.click(await screen.findByRole("button", { name: "Retry publication" }));

    await waitFor(() =>
      expect(mocks.retryPublication).toHaveBeenCalledWith({
        data: { productDraftId: productId },
      }),
    );
    expect(await screen.findByText("Publishing product and images")).toBeInTheDocument();
  });

  it("refreshes seller queries and exposes public navigation after completion", async () => {
    mocks.getPublication.mockResolvedValueOnce({
      ...publication("completed"),
      productStatus: "published",
      publicProductUrl: `/p/${productId}`,
    });
    const { queryClient } = renderEditor({
      ...initial,
      imagePublicationMode: "imported",
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    expect(await screen.findByRole("link", { name: "View published product" })).toBeVisible();
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-products"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-product", productId] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-product-summary"] });
    });
  });

  it("uses one Save changes action and never republishes a published product", async () => {
    mocks.save.mockResolvedValueOnce({
      id: productId,
      title: "Model title",
      titleSource: "model",
      status: "published",
    });
    renderEditor({
      ...initial,
      status: "published",
      imagePublicationMode: "imported",
    });

    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

function renderEditor(
  product: InitialProduct | null,
  factsState = { dirty: false, saving: false },
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ProductEditor initial={product} factsState={factsState} />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function publication(
  status:
    | "not_started"
    | "not_required"
    | "pending"
    | "running"
    | "failed"
    | "cleanup_required"
    | "completed",
) {
  return {
    productDraftId: productId,
    productStatus: "draft" as const,
    publicationStatus: status,
    attemptCount: 0,
    errorCode: null,
    retryAllowed: false,
    publicProductUrl: null,
  };
}
