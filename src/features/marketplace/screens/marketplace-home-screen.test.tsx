import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  marketplace: {
    trending: [{ id: "product-1", title: "Cotton dress" }],
    sellers: [
      {
        id: "seller-1",
        slug: "atelier-one",
        name: "Atelier One",
        primary_category_id: "category-1",
        cover_image_url: null,
        verified: true,
        city: "Berlin",
        country: "Germany",
        logo_url: null,
        primary_category_slug: "fashion",
        primary_category_name: "Fashion & Apparel",
      },
    ],
  },
  navigation: {
    audience: "kids",
    categories: [{ id: "category-1", slug: "dresses", name: "Canonical dresses", sortOrder: 10 }],
    sellers: [],
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: (options: { queryKey: string[] }) => ({
    data: options.queryKey[1] === "home" ? mocks.marketplace : mocks.navigation,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    hash,
    params,
    search,
    to,
    ...props
  }: {
    children: ReactNode;
    hash?: string;
    params?: Record<string, string>;
    search?: (previous: Record<string, unknown>) => Record<string, unknown>;
    to: string;
    [key: string]: unknown;
  }) => (
    <a
      {...props}
      href="#test"
      data-route={to}
      data-route-hash={hash}
      data-route-params={params ? JSON.stringify(params) : undefined}
      data-route-search={search ? JSON.stringify(search({ lang: "DE" })) : undefined}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/components/layout/public-shell", () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../components/marketplace-product-rail", () => ({
  MarketplaceProductRail: ({
    audience,
    products,
  }: {
    audience: string;
    products: Array<{ id: string; title: string }>;
  }) => (
    <section data-testid="marketplace-product-rail" data-audience={audience}>
      {products.map((product) => (
        <div key={product.id}>{product.title}</div>
      ))}
    </section>
  ),
}));

vi.mock("../components/marketplace-category-discovery", () => ({
  MarketplaceCategoryDiscovery: ({
    audience,
    categories,
  }: {
    audience: string;
    categories: Array<{ id: string; name: string }>;
  }) => (
    <section data-testid="marketplace-category-discovery" data-audience={audience}>
      {categories.map((category) => (
        <div key={category.id}>{category.name}</div>
      ))}
    </section>
  ),
}));

vi.mock("../components/marketplace-supplier-grid", () => ({
  MarketplaceSupplierGrid: ({
    audience,
    sellers,
  }: {
    audience: string;
    sellers: Array<{ id: string; name: string }>;
  }) => (
    <section data-testid="marketplace-supplier-grid" data-audience={audience}>
      {sellers.map((seller) => (
        <div key={seller.id}>{seller.name}</div>
      ))}
    </section>
  ),
}));

vi.mock("../components/marketplace-process-section", () => ({
  MarketplaceProcessSection: () => (
    <section data-testid="marketplace-process">How it works</section>
  ),
}));

vi.mock("../components/marketplace-seller-cta", () => ({
  MarketplaceSellerCta: () => (
    <section data-testid="marketplace-seller-cta">Sell wholesale on Bazoria</section>
  ),
}));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: { EN: string }) => value.EN,
  useLang: () => "EN",
}));

vi.mock("../queries", () => ({
  audienceNavigationQueryOptions: (audience: string) => ({
    queryKey: ["marketplace", "navigation", audience],
  }),
  marketplaceQueryOptions: (audience: string) => ({
    queryKey: ["marketplace", "home", audience],
  }),
}));

import { MarketplaceHomeScreen } from "./marketplace-home-screen";

describe("MarketplaceHomeScreen", () => {
  it("uses the audience catalog as the primary discovery action and category source", () => {
    render(<MarketplaceHomeScreen audience="kids" />);

    const browse = screen.getByRole("link", { name: "Browse products" });
    expect(browse).toHaveAttribute("data-route", "/c/$category");
    expect(browse).toHaveAttribute("data-route-params", JSON.stringify({ category: "fashion" }));
    expect(browse).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "kids" }),
    );
    expect(screen.getByTestId("marketplace-category-discovery")).toHaveAttribute(
      "data-audience",
      "kids",
    );
    expect(screen.getByText("Canonical dresses")).toBeVisible();
  });

  it("keeps live sections in the approved order without changing later content", () => {
    render(<MarketplaceHomeScreen audience="kids" />);

    expect(screen.getByText("Cotton dress")).toBeVisible();
    const products = screen.getByTestId("marketplace-product-rail");
    const categories = screen.getByTestId("marketplace-category-discovery");
    const suppliers = screen.getByTestId("marketplace-supplier-grid");
    const process = screen.getByTestId("marketplace-process");
    const sellerCta = screen.getByTestId("marketplace-seller-cta");
    expect(products).toHaveAttribute("data-audience", "kids");
    expect(categories).toHaveAttribute("data-audience", "kids");
    expect(suppliers).toHaveAttribute("data-audience", "kids");
    expect(screen.getByText("Atelier One")).toBeVisible();
    expect(products.compareDocumentPosition(categories) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(categories.compareDocumentPosition(suppliers) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(suppliers.compareDocumentPosition(process) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(process.compareDocumentPosition(sellerCta) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const join = screen.getByRole("link", { name: "Join the network" });
    expect(join).toHaveAttribute("data-route", "/join");
    expect(join).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "kids" }),
    );
    expect(screen.queryByRole("link", { name: "Sell on Bazoria" })).not.toBeInTheDocument();
    expect(screen.queryByText("Are you a wholesaler?")).not.toBeInTheDocument();
    expect(process).toHaveTextContent("How it works");
    expect(sellerCta).toHaveTextContent("Sell wholesale on Bazoria");
  });
});
