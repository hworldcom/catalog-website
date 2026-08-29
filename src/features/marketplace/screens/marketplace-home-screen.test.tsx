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

vi.mock("@/components/product/product-card", () => ({
  ProductCard: ({ product }: { product: { title: string } }) => <div>{product.title}</div>,
}));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: { EN: string }) => value.EN,
  useLang: () => "EN",
}));

vi.mock("../public-category-labels", () => ({
  getPublicCategoryLabel: (_slug: string, name: string) => name,
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
  it("uses the audience catalog as the primary discovery action without category cards", () => {
    render(<MarketplaceHomeScreen audience="kids" />);

    const browse = screen.getByRole("link", { name: "Browse products" });
    expect(browse).toHaveAttribute("data-route", "/c/$category");
    expect(browse).toHaveAttribute("data-route-params", JSON.stringify({ category: "fashion" }));
    expect(browse).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "kids" }),
    );
    expect(screen.queryByRole("heading", { name: "Browse by category" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Canonical dresses" })).not.toBeInTheDocument();
  });

  it("keeps the remaining homepage discovery sections", () => {
    render(<MarketplaceHomeScreen audience="kids" />);

    expect(screen.getByText("Cotton dress")).toBeVisible();
    expect(screen.getByRole("link", { name: /Atelier One/ })).toBeVisible();
    const join = screen.getByRole("link", { name: "Join the network" });
    expect(join).toHaveAttribute("data-route", "/join");
    expect(join).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "kids" }),
    );
    expect(screen.queryByRole("link", { name: "Sell on Bazoria" })).not.toBeInTheDocument();
    expect(screen.queryByText("Are you a wholesaler?")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How it works" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sell wholesale on Bazoria" })).toBeVisible();
    const sellerAccount = screen.getByRole("link", { name: "Create seller account" });
    expect(sellerAccount).toHaveAttribute("data-route", "/auth");
  });
});
