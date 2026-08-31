import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SellerProductListPage } from "../seller-product-list.types";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  classifierAssistedUploadEnabled: true,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/features/seller/products.functions", () => ({
  listMyProducts: mocks.list,
  archiveMyProduct: mocks.archive,
  restoreMyProduct: mocks.restore,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock("@/features/classifier-release/classifier-release-ui", () => ({
  ClassifierAssistedUploadDisabledNotice: () => null,
}));

vi.mock("@/features/classifier-release/classifier-release-runtime", () => ({
  useClassifierAssistedUploadEnabled: () => mocks.classifierAssistedUploadEnabled,
}));

import { ProductsScreen } from "./products-screen";

describe("ProductsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.classifierAssistedUploadEnabled = true;
    mocks.archive.mockResolvedValue({ productId: uuid(1), productStatus: "archived" });
    mocks.restore.mockResolvedValue({
      productId: uuid(1),
      productStatus: "archived",
      restorationDraft: true,
      editRoute: `/seller/products/${uuid(1)}`,
    });
    mocks.navigate.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("always presents manual and classifier-assisted ingestion as peer actions", async () => {
    mocks.list.mockResolvedValue(page());
    const populated = renderScreen();

    await screen.findByText("Cotton shirt");
    expect(screen.getByRole("link", { name: "Add product manually" })).toHaveAttribute(
      "href",
      "/seller/products/new",
    );
    expect(
      screen.getByRole("link", { name: "Upload photos for automatic grouping" }),
    ).toHaveAttribute("href", "/seller/classifier-batches/new");

    populated.unmount();
    mocks.list.mockResolvedValue({
      ...page(),
      products: [],
    });
    renderScreen();

    expect(await screen.findByText("No products yet.")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Add product manually" })).toHaveLength(2);
    expect(
      screen.getAllByRole("link", { name: "Upload photos for automatic grouping" }),
    ).toHaveLength(2);
  });

  it("keeps manual ingestion and hides automatic grouping when the release gate is disabled", async () => {
    mocks.classifierAssistedUploadEnabled = false;
    mocks.list.mockResolvedValue(page());
    renderScreen();

    await screen.findByText("Cotton shirt");
    expect(screen.getByRole("link", { name: "Add product manually" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Upload photos for automatic grouping" }),
    ).not.toBeInTheDocument();
  });

  it("uses the page-bound query key and navigates to the returned next cursor", async () => {
    mocks.list.mockResolvedValue(page({ nextCursor: "next-page" }));
    const onRequestChange = vi.fn();
    const { queryClient } = renderScreen({
      request: { status: "active", limit: 25, cursor: null },
      onRequestChange,
    });

    expect(await screen.findByRole("img", { name: "Cotton shirt" })).toHaveAttribute(
      "src",
      "https://signed.test/one",
    );
    expect(screen.getByText("Product code")).toBeVisible();
    expect(screen.getByText("SEL-F-TSH-ABCDEFGH")).toBeVisible();
    expect(screen.getByText("Product:")).toBeVisible();
    expect(screen.getByText("Marketplace:")).toBeVisible();
    expect(screen.getByText("Not visible")).toBeVisible();
    expect(screen.getByText("Review:")).toBeVisible();
    expect(screen.getByText("Activation:")).toBeVisible();
    expect(screen.getByText("Not submitted")).toBeVisible();
    expect(screen.getByText("Not started")).toBeVisible();
    expect(queryClient.getQueryData(["my-products", "active", 25, null])).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onRequestChange).toHaveBeenCalledWith({
      status: "active",
      limit: 25,
      cursor: "next-page",
    });
  });

  it("distinguishes a published product from a disabled storefront", async () => {
    const result = page({ status: "published" });
    result.products[0].marketplaceVisibility = "storefront_disabled";
    mocks.list.mockResolvedValue(result);

    renderScreen();

    expect(await screen.findByText("Published")).toBeVisible();
    expect(screen.getByText("Storefront disabled")).toBeVisible();
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

  it("archives and invalidates every product page and the summary", async () => {
    mocks.list.mockResolvedValue(page());
    const onRequestChange = vi.fn();
    const { queryClient } = renderScreen({
      request: { status: "active", limit: 25, cursor: "current-page" },
      onRequestChange,
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByText("Cotton shirt");
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(mocks.archive).toHaveBeenCalledWith({
        data: {
          id: uuid(1),
          expectedModerationRevision: 3,
          requestId: expect.any(String),
        },
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-products"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-product-summary"] });
    expect(onRequestChange).toHaveBeenCalledWith({
      status: "active",
      limit: 25,
      cursor: null,
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Product archived");
  });

  it("creates a restoration draft and opens it from the archived product list", async () => {
    mocks.list.mockResolvedValue(page({ status: "archived" }));
    renderScreen({ request: { status: "archived", limit: 25, cursor: null } });

    await screen.findByText("Cotton shirt");
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(mocks.restore).toHaveBeenCalledWith({
        data: {
          id: uuid(1),
          expectedModerationRevision: 3,
          requestId: expect.any(String),
        },
      }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Restoration draft created");
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/seller/products/$id",
      params: { id: uuid(1) },
    });
  });

  it("resets pagination when switching between active and archived products", async () => {
    mocks.list.mockResolvedValue(page());
    const onRequestChange = vi.fn();
    renderScreen({
      request: { status: "active", limit: 25, cursor: "current-page" },
      onRequestChange,
    });

    await screen.findByText("Cotton shirt");
    await userEvent.click(screen.getByRole("button", { name: "Archived products" }));

    expect(onRequestChange).toHaveBeenCalledWith({
      status: "archived",
      limit: 25,
      cursor: null,
    });
  });

  it.each([
    ["product_not_found", "The product was not found."],
    [
      "product_archive_not_allowed",
      "Wait for active publication or complete publication cleanup before archiving this product.",
    ],
    [
      "product_moderation_activation_unavailable",
      "Product archive and restore are temporarily unavailable.",
    ],
  ])("shows localized guidance for %s", async (code, message) => {
    mocks.list.mockResolvedValue(page());
    mocks.archive.mockRejectedValue({ code });
    renderScreen();

    await screen.findByText("Cotton shirt");
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(message));
  });
});

function renderScreen({
  request = { status: "active", limit: 25, cursor: null },
  onRequestChange = vi.fn(),
}: {
  request?: { status: "active" | "archived"; limit: number; cursor: string | null };
  onRequestChange?: (request: {
    status: "active" | "archived";
    limit: number;
    cursor: string | null;
  }) => void;
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
  status = "draft",
}: {
  nextCursor?: string | null;
  previewUrl?: string;
  status?: "draft" | "published" | "archived";
} = {}): SellerProductListPage {
  return {
    products: [
      {
        id: uuid(1),
        title: "Cotton shirt",
        product_code: "SEL-F-TSH-ABCDEFGH",
        cover_image_url: null,
        price: null,
        currency: "USD",
        moq: null,
        pack_size: null,
        stock: "in_stock",
        publicState: status,
        marketplaceVisibility: status === "published" ? "visible" : "not_published",
        actionRevision: 3,
        hasWorkingCopy: false,
        review: null,
        activation: null,
        actions: {
          canEdit: status !== "archived",
          canSubmit: status !== "archived",
          canWithdraw: false,
          canAbandonFailedActivation: false,
          canRetryAbandonmentCleanup: false,
          canArchive: status !== "archived",
          canRestore: status === "archived",
        },
        created_at: "2026-07-27T10:00:00.000Z",
        preview: {
          source: "private_draft",
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
