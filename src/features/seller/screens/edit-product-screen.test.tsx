import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));

vi.mock("@/features/seller/products.functions", () => ({
  getMyProduct: mocks.get,
}));

vi.mock("../product-draft-image-lifecycle.functions", () => ({
  prepareMyProductDraftImageUploads: vi.fn(),
  finalizeMyProductDraftImageUploads: vi.fn(),
  updateMyProductDraftImageGallery: vi.fn(),
  removeMyProductDraftImage: vi.fn(),
  retryMyProductDraftImageCleanup: vi.fn(),
}));

vi.mock("../components/product-editor", () => ({
  ProductEditor: ({ initial }: { initial: { title: string } }) => (
    <input aria-label="Editable product title" defaultValue={initial.title} />
  ),
}));

vi.mock("@/features/product-draft-facts/components/product-draft-facts-editor", () => ({
  ProductDraftFactsEditor: () => <input aria-label="Editable product facts" defaultValue="" />,
}));

vi.mock(
  "@/features/product-draft-descriptions/components/seller-product-draft-description-section",
  () => ({
    SellerProductDraftDescriptionSection: () => (
      <input aria-label="Editable product description" defaultValue="" />
    ),
  }),
);

import { EditProductScreen } from "./edit-product-screen";

const productDraftId = uuid(1);
const imageId = uuid(101);

describe("EditProductScreen gallery refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get
      .mockResolvedValueOnce(snapshot("first"))
      .mockResolvedValueOnce(snapshot("replacement"));
  });

  it("refreshes only gallery state and preserves unsaved product and facts edits", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <EditProductScreen productId={productDraftId} />
      </QueryClientProvider>,
    );

    const title = await screen.findByRole("textbox", { name: "Editable product title" });
    const facts = screen.getByRole("textbox", { name: "Editable product facts" });
    await userEvent.clear(title);
    await userEvent.type(title, "Unsaved seller title");
    await userEvent.type(facts, "Unsaved facts");

    fireEvent.error(screen.getByRole("img", { name: "Cotton shirt, Position 1" }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Cotton shirt, Position 1" })).toHaveAttribute(
        "src",
        "https://signed.test/replacement",
      ),
    );

    expect(title).toHaveValue("Unsaved seller title");
    expect(facts).toHaveValue("Unsaved facts");
  });

  it("keeps both editors usable when the complete gallery is unavailable", async () => {
    mocks.get.mockReset().mockResolvedValue({
      ...snapshot("unused"),
      gallery: {
        status: "unavailable",
        errorCode: "product_draft_image_delivery_unavailable",
        images: [],
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <EditProductScreen productId={productDraftId} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        "Product images are temporarily unavailable. You can continue editing the product.",
      ),
    ).toBeInTheDocument();
    const title = screen.getByRole("textbox", { name: "Editable product title" });
    const facts = screen.getByRole("textbox", { name: "Editable product facts" });
    await userEvent.clear(title);
    await userEvent.type(title, "Still editable");
    await userEvent.type(facts, "Still editable facts");

    expect(title).toHaveValue("Still editable");
    expect(facts).toHaveValue("Still editable facts");
  });
});

function snapshot(urlSuffix: string) {
  return {
    product: {
      id: productDraftId,
      seller_id: uuid(2),
      title: "Cotton shirt",
      title_source: "model",
      description: null,
      category_id: null,
      classifier_group_id: null,
      classifier_organization_id: null,
      cover_image_id: null,
      cover_image_url: null,
      moq: null,
      pack_size: null,
      price: null,
      currency: "USD",
      stock: "in_stock",
      trending: false,
      status: "draft",
      created_at: "2026-07-26T12:00:00.000Z",
      updated_at: "2026-07-26T12:00:00.000Z",
    },
    gallery: {
      status: "available",
      errorCode: null,
      images: [
        {
          imageId,
          sourcePosition: 0,
          durableStatus: "available",
          deliveryStatus: "available",
          deliveryErrorCode: null,
          url: `https://signed.test/${urlSuffix}`,
          expiresAt: "2099-07-26T12:05:00.000Z",
          isSourceCover: true,
        },
      ],
    },
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
