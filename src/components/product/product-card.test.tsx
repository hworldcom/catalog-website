import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
    to,
    ...props
  }: {
    children: ReactNode;
    params?: Record<string, string>;
    search?: (previous: Record<string, unknown>) => Record<string, unknown>;
    to: string;
    [key: string]: unknown;
  }) => (
    <a
      {...props}
      href="#test"
      data-route={to}
      data-route-params={params ? JSON.stringify(params) : undefined}
      data-route-search={search ? JSON.stringify(search({ lang: "DE" })) : undefined}
    >
      {children}
    </a>
  ),
}));

import { ProductCard, type EditorialProductCardProduct } from "./product-card";

const editorialProduct: EditorialProductCardProduct = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Cotton shirt",
  cover_image_url: "https://example.test/cotton-shirt.webp",
  price: 12.5,
  currency: "EUR",
  moq: 5,
  pack_size: "5 pieces",
  stock: "in_stock",
  seller_name: "Atelier One",
  seller_slug: "atelier-one",
};

describe("ProductCard", () => {
  it("keeps the existing full-card default appearance", () => {
    const { container } = render(<ProductCard product={editorialProduct} />);

    const productLink = screen.getByRole("link", { name: /Cotton shirt/ });
    expect(productLink).toHaveAttribute("data-route", "/p/$productId");
    expect(productLink).not.toHaveAttribute("data-route-search");
    expect(productLink).toHaveClass("border", "overflow-hidden");
    expect(screen.getByAltText("Cotton shirt").parentElement).toHaveClass("aspect-square");
    expect(container.querySelector('[data-appearance="editorial"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Atelier One" })).not.toBeInTheDocument();
  });

  it("renders valid separate product and seller links in the editorial appearance", () => {
    const { container } = render(
      <ProductCard appearance="editorial" audience="women" product={editorialProduct} />,
    );

    const productLink = screen.getByRole("link", { name: "Cotton shirt" });
    const sellerLink = screen.getByRole("link", { name: "Atelier One" });
    const expectedSearch = JSON.stringify({ lang: "DE", audience: "women" });

    expect(productLink).toHaveAttribute("data-route", "/p/$productId");
    expect(productLink).toHaveAttribute(
      "data-route-params",
      JSON.stringify({ productId: editorialProduct.id }),
    );
    expect(productLink).toHaveAttribute("data-route-search", expectedSearch);
    expect(sellerLink).toHaveAttribute("data-route", "/s/$sellerSlug");
    expect(sellerLink).toHaveAttribute(
      "data-route-params",
      JSON.stringify({ sellerSlug: "atelier-one" }),
    );
    expect(sellerLink).toHaveAttribute("data-route-search", expectedSearch);
    expect(productLink).not.toContainElement(sellerLink);
    expect(container.querySelector("a a")).toBeNull();
    expect(screen.getByText("EUR 12.50")).toBeVisible();
    expect(screen.getByText("In stock")).toBeVisible();
    expect(screen.getByText("MOQ 5 · 5 pieces")).toBeVisible();
    expect(screen.getByAltText("Cotton shirt")).toHaveAttribute("loading", "lazy");
    expect(screen.getByTestId("editorial-product-image")).toHaveClass("aspect-[4/5]");
  });

  it("preserves quote and standalone pack-size states and reserves failed images", () => {
    render(
      <ProductCard
        appearance="editorial"
        audience="all"
        product={{ ...editorialProduct, price: null, moq: null, pack_size: "Case of 12" }}
      />,
    );

    expect(screen.getByText("Ask for quote")).toBeVisible();
    expect(screen.getByText("Case of 12")).toBeVisible();
    expect(screen.queryByText(/MOQ/)).not.toBeInTheDocument();

    fireEvent.error(screen.getByAltText("Cotton shirt"));

    expect(screen.queryByAltText("Cotton shirt")).not.toBeInTheDocument();
    expect(screen.getByTestId("editorial-product-image")).toHaveClass("bg-muted", "aspect-[4/5]");
  });
});
