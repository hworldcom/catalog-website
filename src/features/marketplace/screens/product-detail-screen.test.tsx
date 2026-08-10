import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: {
    product: {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Cotton shirt",
      product_code: "SEL-F-TSH-ABCDEFGH",
      cover_image_url: null as string | null,
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
    images: [] as Array<{ id: string; url: string }>,
    category: null,
    description: null as {
      text: string;
      resolvedLanguage: "EN" | "PL" | "DE" | "VI";
    } | null,
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
  beforeEach(() => {
    mocks.data.images = [];
    mocks.data.product.cover_image_url = null;
    mocks.data.product.description = null;
    mocks.data.description = null;
  });

  it("shows the exact stored product code as read-only text", () => {
    render(
      <ProductDetailScreen productId={mocks.data.product.id} language="EN" audience="women" />,
    );

    expect(screen.getByText("Product code")).toBeVisible();
    expect(screen.getByText("SEL-F-TSH-ABCDEFGH")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Product code" })).not.toBeInTheDocument();
  });

  it("links the supplier detail to its public storefront", () => {
    render(
      <ProductDetailScreen productId={mocks.data.product.id} language="EN" audience="women" />,
    );

    const supplierDetail = screen.getByText("Supplier").closest("div");
    expect(supplierDetail).not.toBeNull();
    const supplierLink = within(supplierDetail!).getByRole("link", { name: "Seller" });

    expect(supplierLink).toHaveAttribute("data-route", "/s/$sellerSlug");
    expect(supplierLink).toHaveAttribute("data-seller-slug", "seller");
    expect(supplierLink).toHaveClass("hover:underline", "focus-visible:ring-2");
  });

  it("shows every published image and lets keyboard controls change the main image", async () => {
    mocks.data.images = Array.from({ length: 9 }, (_, index) => ({
      id: `image-${index + 1}`,
      url: `https://public.test/image-${index + 1}.jpg`,
    }));
    mocks.data.product.cover_image_url = mocks.data.images[1]!.url;

    render(
      <ProductDetailScreen productId={mocks.data.product.id} language="EN" audience="women" />,
    );

    expect(screen.getByRole("img", { name: "Cotton shirt" })).toHaveAttribute(
      "src",
      "https://public.test/image-2.jpg",
    );
    expect(screen.getAllByRole("button", { name: /Select product image/ })).toHaveLength(9);

    await userEvent.click(screen.getByRole("button", { name: "Select product image 9" }));
    expect(screen.getByRole("img", { name: "Cotton shirt" })).toHaveAttribute(
      "src",
      "https://public.test/image-9.jpg",
    );
    expect(screen.getByRole("button", { name: "Select product image 9" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("falls back to the cover when a selected non-cover image fails", async () => {
    mocks.data.images = [
      { id: "cover", url: "https://public.test/cover.jpg" },
      { id: "detail", url: "https://public.test/detail.jpg" },
    ];
    mocks.data.product.cover_image_url = "https://public.test/cover.jpg";
    render(
      <ProductDetailScreen productId={mocks.data.product.id} language="EN" audience="women" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Select product image 2" }));
    fireEvent.error(screen.getByRole("img", { name: "Cotton shirt" }));

    expect(screen.getByRole("img", { name: "Cotton shirt" })).toHaveAttribute(
      "src",
      "https://public.test/cover.jpg",
    );
    expect(screen.getByRole("button", { name: "Select product image 2" })).toBeDisabled();
  });

  it.each([
    ["EN", "Product description"],
    ["PL", "Opis produktu"],
    ["DE", "Produktbeschreibung"],
    ["VI", "Mô tả sản phẩm"],
  ] as const)("shows the localized description heading for %s", (language, heading) => {
    mocks.data.description = {
      text: "Localized description",
      resolvedLanguage: language,
    };

    render(
      <ProductDetailScreen
        productId={mocks.data.product.id}
        language={language}
        audience="women"
      />,
    );

    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByText("Localized description")).toBeVisible();
  });

  it("keeps the requested-language heading when the body falls back to English", () => {
    mocks.data.description = {
      text: "English fallback",
      resolvedLanguage: "EN",
    };

    render(
      <ProductDetailScreen productId={mocks.data.product.id} language="DE" audience="women" />,
    );

    expect(screen.getByRole("heading", { name: "Produktbeschreibung" })).toBeVisible();
    expect(screen.getByText("English fallback")).toBeVisible();
  });

  it("omits the description section when no public description is available", () => {
    mocks.data.product.description = "Legacy English projection";

    render(
      <ProductDetailScreen productId={mocks.data.product.id} language="EN" audience="women" />,
    );

    expect(screen.queryByRole("heading", { name: "Product description" })).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy English projection")).not.toBeInTheDocument();
  });

  it("renders description text literally and preserves line breaks", () => {
    mocks.data.description = {
      text: "First line\n<strong>Second line</strong>",
      resolvedLanguage: "EN",
    };

    render(
      <ProductDetailScreen productId={mocks.data.product.id} language="EN" audience="women" />,
    );

    const description = screen.getByText(/First line/);
    expect(description).toHaveTextContent("First line <strong>Second line</strong>");
    expect(description).toHaveClass("whitespace-pre-line");
    expect(description.querySelector("strong")).toBeNull();
  });
});
