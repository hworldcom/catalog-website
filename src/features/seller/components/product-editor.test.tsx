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
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
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
  listProductCategories: mocks.listCategories,
}));

import { ProductEditor } from "./product-editor";
import type { ProductAudience } from "@/features/product-audience/product-audience.types";

const productId = "00000000-0000-4000-8000-000000000001";
const productCategoryId = "00000000-0000-4000-8000-000000000002";

type InitialProduct = {
  id: string;
  title: string;
  product_code: string | null;
  title_source: "human" | "model" | null;
  description: string | null;
  audiences: ProductAudience[];
  category_id: string | null;
  moq: number | null;
  pack_size: string | null;
  price: number | string | null;
  currency: string;
  stock: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
  cover_image_url: string | null;
  trending: boolean;
  status: "draft" | "published" | "archived";
  moderation_editable?: boolean;
  imagePublicationMode?: "durable" | "direct";
  imageSourceMode?: "classifier_import" | "seller_upload";
};

const initial: InitialProduct = {
  id: productId,
  moderation_revision: 3,
  title: "Model title",
  product_code: "SEL-F-TSH-ABCDEFGH",
  title_source: "model" as const,
  description: null,
  audiences: ["women"],
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
const completeInitial: InitialProduct = {
  ...initial,
  category_id: productCategoryId,
};

describe("ProductEditor title and description behavior", () => {
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
    mocks.save.mockResolvedValue({
      id: productId,
      title: "Model title",
      moderationRevision: 4,
      titleSource: "model",
      status: "draft",
    });
    mocks.getPublication.mockResolvedValue(publication("not_started"));
    mocks.publish.mockResolvedValue(publication("pending"));
    mocks.retryPublication.mockResolvedValue(publication("pending"));
  });

  it("shows a persisted code but no code field for an unsaved product", () => {
    const persisted = renderEditor(initial);
    expect(screen.getByText("Product code:")).toBeVisible();
    expect(screen.getByText("SEL-F-TSH-ABCDEFGH")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /Product code/i })).not.toBeInTheDocument();

    persisted.unmount();
    renderEditor(null);
    expect(screen.queryByText("Product code:")).not.toBeInTheDocument();
    expect(screen.queryByText("SEL-F-TSH-ABCDEFGH")).not.toBeInTheDocument();
  });

  it("shows the publication-time fallback for an uncoded draft", () => {
    renderEditor({ ...initial, product_code: null });
    expect(screen.getByText("Assigned when publishing")).toBeVisible();
  });

  it("omits an untouched existing title", async () => {
    renderEditor(initial);
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].data).not.toHaveProperty("title");
  });

  it("saves the complete selected audience set in canonical order", async () => {
    renderEditor(initial);

    await userEvent.click(screen.getByRole("checkbox", { name: "Men" }));
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].data).toMatchObject({
      audiences: ["women", "men"],
    });
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

  it("preserves unsaved fields when a stale save finds an archived product", async () => {
    renderEditor(initial);
    const input = screen.getByRole("textbox", { name: "Title" });

    await userEvent.clear(input);
    await userEvent.type(input, "Unsaved seller title");
    mocks.save.mockRejectedValueOnce({ code: "product_draft_title_not_editable" });
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "This product was archived and can no longer be edited.",
      ),
    );
    expect(input).toHaveValue("Unsaved seller title");
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

  it("removes the legacy description control and never submits it for a saved product", async () => {
    renderEditor({ ...initial, description: "Model description" });
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].data).not.toHaveProperty("description");
  });

  it("preserves edited product fields after a failed draft save", async () => {
    mocks.save.mockRejectedValueOnce(new Error("temporary save failure"));
    renderEditor(initial);

    const title = screen.getByRole("textbox", { name: "Title" });
    const price = screen.getByRole("spinbutton", { name: "Price (per unit)" });
    await userEvent.clear(title);
    await userEvent.type(title, "Recovered title");
    await userEvent.type(price, "19.50");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(title).toHaveValue("Recovered title");
    expect(price).toHaveValue(19.5);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });

  it.each(["published", "archived"] as const)(
    "makes a %s ProductDraft title read-only",
    async (status) => {
      renderEditor({ ...initial, status });
      expect(screen.getByRole("textbox", { name: "Title" })).toBeDisabled();
      expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    },
  );

  it("hides and omits the manual cover for an imported ProductDraft", async () => {
    renderEditor({
      ...completeInitial,
      imagePublicationMode: "durable",
      cover_image_url: "https://public.example/stale.jpg",
    });

    expect(screen.queryByText("Image upload")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1));
    expect(mocks.publish.mock.calls[0]?.[0].data).not.toHaveProperty("cover_image_url");
    expect(mocks.publish.mock.calls[0]?.[0].data).toMatchObject({
      expectedModerationRevision: 3,
    });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(await screen.findByText("Publishing product and images")).toBeInTheDocument();
  });

  it("removes the direct public-cover control and requires a private gallery", async () => {
    renderEditor(
      {
        ...completeInitial,
        imagePublicationMode: "direct",
        imageSourceMode: "seller_upload",
      },
      undefined,
      undefined,
      {
        galleryState: {
          activeImageCount: 0,
          hasDurableImages: false,
          hasAvailableCover: false,
          incomplete: false,
        },
      },
    );

    expect(screen.queryByText("Image upload")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText("Add at least one product picture before publishing.")).toBeVisible();
  });

  it("keeps the durable publication path while the last private image needs recovery", async () => {
    renderEditor(
      {
        ...completeInitial,
        imagePublicationMode: "durable",
        imageSourceMode: "seller_upload",
      },
      undefined,
      undefined,
      {
        galleryState: {
          activeImageCount: 0,
          hasDurableImages: true,
          hasAvailableCover: false,
          incomplete: true,
        },
      },
    );

    await waitFor(() => expect(mocks.getPublication).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Product publication")).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(
      screen.getByText("Resolve pending, failed, or deleting product pictures before publishing."),
    ).toBeVisible();
  });

  it("blocks publication while optional facts are dirty", async () => {
    renderEditor(
      { ...completeInitial, imagePublicationMode: "durable" },
      { dirty: true, saving: false },
    );

    expect(
      screen.getByText("Save product details and descriptions before publishing."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("blocks publication while multilingual descriptions are dirty", async () => {
    renderEditor(
      { ...completeInitial, imagePublicationMode: "durable" },
      { dirty: false, saving: false },
      { dirty: true, saving: false },
    );

    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("reports durable publication state", async () => {
    mocks.getPublication.mockResolvedValueOnce(publication("pending"));
    const onStateChange = vi.fn();
    renderEditor({ ...initial, imagePublicationMode: "durable" }, undefined, undefined, {
      onStateChange,
    });

    await waitFor(() =>
      expect(onStateChange).toHaveBeenCalledWith({
        dirty: false,
        saving: false,
        publicationActive: true,
      }),
    );
  });

  it("keeps Save draft enabled while blocking publication without title or category", () => {
    renderEditor({ ...initial, title: "", category_id: null });

    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(
      screen.getByText(
        "Enter a title and select a category before publishing. You can save the product as a draft without them.",
      ),
    ).toBeVisible();
  });

  it("reports unsaved product changes", async () => {
    const onStateChange = vi.fn();
    renderEditor(initial, undefined, undefined, { onStateChange });

    await userEvent.type(screen.getByRole("textbox", { name: "Pack size" }), "12 per box");
    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({
        dirty: true,
        saving: false,
        publicationActive: false,
      }),
    );
  });

  it("applies a generated title without discarding other unsaved product fields", async () => {
    const view = renderEditor(initial);
    const packSize = screen.getByRole("textbox", { name: "Pack size" });

    await userEvent.type(packSize, "12 per box");
    view.rerenderEditor(initial, {
      titleReplacement: {
        version: 1,
        snapshot: { title: "Generated cotton shirt", source: "model" },
      },
    });

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Generated cotton shirt");
    expect(packSize).toHaveValue("12 per box");

    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].data).not.toHaveProperty("title");
    expect(mocks.save.mock.calls[0]?.[0].data).toMatchObject({ pack_size: "12 per box" });
  });

  it("shows a server-approved retry for a failed durable run", async () => {
    mocks.getPublication.mockResolvedValueOnce({
      ...publication("failed"),
      failureReasonCode: "product_publication_transfer_failed",
      retryAllowed: true,
    });
    renderEditor({ ...completeInitial, imagePublicationMode: "durable" });

    await userEvent.click(await screen.findByRole("button", { name: "Retry publication" }));

    await waitFor(() =>
      expect(mocks.retryPublication).toHaveBeenCalledWith({
        data: { productDraftId: productId },
      }),
    );
    expect(await screen.findByText("Publishing product and images")).toBeInTheDocument();
  });

  it("shows the durable root cause without rendering its raw code", async () => {
    mocks.getPublication.mockResolvedValueOnce({
      ...publication("failed"),
      failureReasonCode: "product_publication_source_unavailable",
      retryAllowed: true,
    });
    renderEditor({ ...initial, imagePublicationMode: "durable" });

    expect(
      await screen.findByText(
        "One or more product pictures could not be read. Try again. If the problem continues, contact support.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("product_publication_source_unavailable")).not.toBeInTheDocument();
  });

  it("shows both the root cause and cleanup guidance", async () => {
    mocks.getPublication.mockResolvedValueOnce({
      ...publication("cleanup_required"),
      failureReasonCode: "product_publication_finalization_failed",
      retryAllowed: false,
    });
    renderEditor({ ...initial, imagePublicationMode: "durable" });

    expect(
      await screen.findByText(
        "The product could not be finalized after its pictures were prepared. Check the product fields, save any corrections, and try again.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Temporary public-image files must be cleaned up before publication can be retried.",
      ),
    ).toBeVisible();
  });

  it.each([
    ["product_publication_title_required", "Enter and save a product title before publishing."],
    ["product_publication_title_invalid", "Enter a product title with at most 50 characters."],
    [
      "product_publication_description_invalid",
      "Enter product descriptions with at most 300 characters each.",
    ],
  ])("shows actionable synchronous error %s", async (code, message) => {
    mocks.publish.mockRejectedValueOnce({ code });
    renderEditor(
      {
        ...completeInitial,
        imagePublicationMode: "durable",
        imageSourceMode: "classifier_import",
      },
      undefined,
      undefined,
      { galleryState: readyGalleryState },
    );

    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(message));
  });

  it("refreshes seller queries and exposes public navigation after completion", async () => {
    mocks.getPublication.mockResolvedValueOnce({
      ...publication("completed"),
      productStatus: "published",
      publicProductUrl: `/p/${productId}`,
    });
    const { queryClient } = renderEditor({
      ...initial,
      imagePublicationMode: "durable",
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
      moderation_editable: true,
      imagePublicationMode: "durable",
    });

    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("locks a published product while its update submission is under review", () => {
    renderEditor({
      ...initial,
      status: "published",
      moderation_editable: false,
      imagePublicationMode: "durable",
    });

    expect(screen.getByDisplayValue("Model title")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
});

function renderEditor(
  product: InitialProduct | null,
  factsState = { dirty: false, saving: false },
  descriptionState = { dirty: false, saving: false },
  props: {
    onStateChange?: Parameters<typeof ProductEditor>[0]["onStateChange"];
    titleReplacement?: Parameters<typeof ProductEditor>[0]["titleReplacement"];
    galleryState?: Parameters<typeof ProductEditor>[0]["galleryState"];
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const renderUi = (nextProduct: InitialProduct | null, nextProps: typeof props = props) => (
    <QueryClientProvider client={queryClient}>
      <ProductEditor
        initial={nextProduct}
        factsState={factsState}
        descriptionState={descriptionState}
        onStateChange={nextProps.onStateChange}
        titleReplacement={nextProps.titleReplacement}
        galleryState={nextProps.galleryState}
      />
    </QueryClientProvider>
  );
  const result = render(renderUi(product));
  return {
    ...result,
    queryClient,
    rerenderEditor: (nextProduct: InitialProduct | null, nextProps: typeof props = props) =>
      result.rerender(renderUi(nextProduct, nextProps)),
  };
}

const readyGalleryState = {
  activeImageCount: 1,
  hasDurableImages: true,
  hasAvailableCover: true,
  incomplete: false,
};

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
    failureReasonCode: null,
    retryAllowed: false,
    publicProductUrl: null,
  };
}
