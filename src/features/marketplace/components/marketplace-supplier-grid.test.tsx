import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicFeaturedSeller } from "../catalog.functions";

const mocks = vi.hoisted(() => ({ language: "EN" as "EN" | "PL" | "DE" | "VI" }));

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
      data-route-search={search ? JSON.stringify(search({ lang: "VI", ref: "home" })) : undefined}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: Record<"EN" | "PL" | "DE" | "VI", string>) => value[mocks.language],
  pick: (value: Record<"EN" | "PL" | "DE" | "VI", string>) => value[mocks.language],
  useLang: () => mocks.language,
}));

import { MarketplaceSupplierGrid } from "./marketplace-supplier-grid";

describe("MarketplaceSupplierGrid", () => {
  beforeEach(() => {
    mocks.language = "EN";
  });

  it("renders live seller metadata and a state-preserving storefront link", () => {
    render(
      <MarketplaceSupplierGrid
        audience="women"
        sellers={[
          seller({
            name: "Atelier One",
            city: "Berlin",
            country: "Germany",
            verified: true,
            primary_category_slug: "fashion",
            primary_category_name: "Fashion & Apparel",
          }),
        ]}
      />,
    );

    const link = screen.getByRole("link", { name: "Atelier One" });
    expect(link).toHaveAttribute("data-route", "/s/$sellerSlug");
    expect(link).toHaveAttribute(
      "data-route-params",
      JSON.stringify({ sellerSlug: "atelier-one" }),
    );
    expect(link).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "VI", ref: "home", audience: "women" }),
    );
    expect(within(link).getByText("Berlin, Germany")).toBeVisible();
    expect(within(link).getByText("Clothing")).toBeVisible();
    expect(within(link).getByText("Verified")).toBeVisible();
    expect(screen.queryByText(/products?/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view all/i })).not.toBeInTheDocument();
  });

  it("falls back from a failed cover to the live logo and then to empty media", () => {
    render(<MarketplaceSupplierGrid audience="all" sellers={[seller()]} />);

    const media = screen.getByTestId("supplier-media-atelier-one");
    const cover = within(media).getByAltText("");
    expect(media).toHaveAttribute("data-media", "cover");
    expect(cover).toHaveAttribute("src", "https://example.test/cover.webp");

    fireEvent.error(cover);

    const logo = within(media).getByAltText("");
    expect(media).toHaveAttribute("data-media", "logo");
    expect(logo).toHaveAttribute("src", "https://example.test/logo.webp");

    fireEvent.error(logo);

    expect(media).toHaveAttribute("data-media", "empty");
    expect(within(media).queryByAltText("")).not.toBeInTheDocument();
    expect(media).toHaveClass("aspect-video", "bg-muted");
  });

  it("uses the logo directly when no cover exists and omits absent metadata", () => {
    render(
      <MarketplaceSupplierGrid
        audience="kids"
        sellers={[
          seller({
            cover_image_url: null,
            city: " ",
            country: null,
            verified: false,
            primary_category_slug: null,
            primary_category_name: null,
          }),
        ]}
      />,
    );

    const link = screen.getByRole("link", { name: "Atelier One" });
    const media = screen.getByTestId("supplier-media-atelier-one");
    expect(media).toHaveAttribute("data-media", "logo");
    expect(within(media).getByAltText("")).toHaveAttribute("src", "https://example.test/logo.webp");
    expect(within(link).queryByText("Verified")).not.toBeInTheDocument();
    expect(within(link).queryByText("Clothing")).not.toBeInTheDocument();
    expect(within(link).queryByText(/Berlin|Germany/)).not.toBeInTheDocument();
  });

  it("renders a translated stable empty state", () => {
    mocks.language = "DE";
    render(<MarketplaceSupplierGrid audience="men" sellers={[]} />);

    expect(screen.getByRole("heading", { name: "Ausgewählte Lieferanten" })).toBeVisible();
    expect(screen.getByText("Noch keine Verkäufer.")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each([
    ["EN", "Featured suppliers", "Real catalogs, direct contact"],
    ["PL", "Wyróżnieni dostawcy", "Prawdziwe katalogi, bezpośredni kontakt"],
    ["DE", "Ausgewählte Lieferanten", "Echte Kataloge, direkter Kontakt"],
    ["VI", "Nhà cung cấp nổi bật", "Danh mục thật, liên hệ trực tiếp"],
  ] as const)("renders the %s section copy", (language, title, subtitle) => {
    mocks.language = language;
    render(<MarketplaceSupplierGrid audience="all" sellers={[]} />);

    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByText(subtitle)).toBeVisible();
  });
});

function seller(overrides: Partial<PublicFeaturedSeller> = {}): PublicFeaturedSeller {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "atelier-one",
    name: "Atelier One",
    city: "Berlin",
    country: "Germany",
    verified: true,
    cover_image_url: "https://example.test/cover.webp",
    logo_url: "https://example.test/logo.webp",
    primary_category_id: "00000000-0000-4000-8000-000000000002",
    primary_category_slug: "fashion",
    primary_category_name: "Fashion & Apparel",
    ...overrides,
  };
}
