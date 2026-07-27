import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SellerProductListPage } from "../seller-product-list.types";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  delete: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/features/seller/products.functions", () => ({
  listMyProducts: mocks.list,
  deleteMyProduct: mocks.delete,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

import { ProductsScreen } from "./products-screen";

describe("ProductsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.delete.mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("uses the page-bound query key and navigates to the returned next cursor", async () => {
    mocks.list.mockResolvedValue(page({ nextCursor: "next-page" }));
    const onRequestChange = vi.fn();
    const { queryClient } = renderScreen({
      request: { limit: 25, cursor: null },
      onRequestChange,
    });

    expect(await screen.findByRole("img", { name: "Cotton shirt" })).toHaveAttribute(
      "src",
      "https://signed.test/one",
    );
    expect(queryClient.getQueryData(["my-products", 25, null])).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onRequestChange).toHaveBeenCalledWith({ limit: 25, cursor: "next-page" });
  });

  it("refreshes a failed private URL once and then renders a placeholder", async () => {
    mocks.list
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page({ previewUrl: "https://signed.test/two" }));
    renderScreen();

    const firstImage = await screen.findByRole("img", { name: "Cotton shirt" });
    fireEvent.error(firstImage);

    const replacement = await screen.findByRole("img", { name: "Cotton shirt" });
    await waitFor(() => expect(replacement).toHaveAttribute("src", "https://signed.test/two"));
    expect(mocks.list).toHaveBeenCalledTimes(2);

    fireEvent.error(replacement);
    expect(await screen.findByText("Image unavailable")).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("invalidates every product page and the summary after deletion", async () => {
    mocks.list.mockResolvedValue(page());
    const onRequestChange = vi.fn();
    const { queryClient } = renderScreen({
      request: { limit: 25, cursor: "current-page" },
      onRequestChange,
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByText("Cotton shirt");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith({ data: { id: uuid(1) } }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-products"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-product-summary"] });
    expect(onRequestChange).toHaveBeenCalledWith({ limit: 25, cursor: null });
  });
});

function renderScreen({
  request = { limit: 25, cursor: null },
  onRequestChange = vi.fn(),
}: {
  request?: { limit: number; cursor: string | null };
  onRequestChange?: (request: { limit: number; cursor: string | null }) => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ProductsScreen request={request} onRequestChange={onRequestChange} />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function page({
  nextCursor = null,
  previewUrl = "https://signed.test/one",
}: {
  nextCursor?: string | null;
  previewUrl?: string;
} = {}): SellerProductListPage {
  return {
    products: [
      {
        id: uuid(1),
        title: "Cotton shirt",
        cover_image_url: null,
        price: null,
        currency: "USD",
        moq: null,
        pack_size: null,
        stock: "in_stock",
        status: "draft",
        created_at: "2026-07-27T10:00:00.000Z",
        preview: {
          source: "imported_private",
          imageId: uuid(101),
          deliveryStatus: "available",
          deliveryErrorCode: null,
          url: previewUrl,
          expiresAt: "2099-07-27T10:05:00.000Z",
        },
      },
    ],
    nextCursor,
    previewDelivery: {
      status: "available",
      errorCode: null,
    },
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
