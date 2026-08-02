import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: {
    product: {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Cotton shirt",
      product_code: "SEL-F-TSH-ABCDEFGH",
      cover_image_url: null,
      price: null,
      currency: "USD",
      stock: "in_stock",
      moq: null,
      pack_size: null,
      description: null,
    },
    seller: {
      id: "00000000-0000-4000-8000-000000000010",
      name: "Seller",
      slug: "seller",
      city: "Berlin",
      country: "Germany",
      whatsapp: null,
    },
    images: [],
    category: null,
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useSuspenseQuery: () => ({ data: mocks.data }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    params,
    to,
  }: {
    children: ReactNode;
    className?: string;
    params?: { sellerSlug?: string };
    to: string;
  }) => (
    <a href="#test" className={className} data-route={to} data-seller-slug={params?.sellerSlug}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/layout/public-shell", () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../components/inquiry-form", () => ({
  InquiryForm: () => <div>Inquiry form</div>,
}));

import { ProductDetailScreen } from "./product-detail-screen";

describe("ProductDetailScreen", () => {
  it("shows the exact stored product code as read-only text", () => {
    render(<ProductDetailScreen productId={mocks.data.product.id} />);

    expect(screen.getByText("Product code")).toBeVisible();
    expect(screen.getByText("SEL-F-TSH-ABCDEFGH")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Product code" })).not.toBeInTheDocument();
  });

  it("links the supplier detail to its public storefront", () => {
    render(<ProductDetailScreen productId={mocks.data.product.id} />);

    const supplierDetail = screen.getByText("Supplier").closest("div");
    expect(supplierDetail).not.toBeNull();
    const supplierLink = within(supplierDetail!).getByRole("link", { name: "Seller" });

    expect(supplierLink).toHaveAttribute("data-route", "/s/$sellerSlug");
    expect(supplierLink).toHaveAttribute("data-seller-slug", "seller");
    expect(supplierLink).toHaveClass("hover:underline", "focus-visible:ring-2");
  });
});
