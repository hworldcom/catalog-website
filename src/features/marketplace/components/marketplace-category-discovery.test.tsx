import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      data-route-search={search ? JSON.stringify(search({ lang: "PL", ref: "home" })) : undefined}
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

import { MarketplaceCategoryDiscovery } from "./marketplace-category-discovery";

describe("MarketplaceCategoryDiscovery", () => {
  beforeEach(() => {
    mocks.language = "EN";
  });

  it("renders audience destinations and approved live categories in the fixed order", () => {
    render(
      <MarketplaceCategoryDiscovery
        audience="all"
        categories={[
          category("shorts", "Shorts", 1),
          category("sportswear", "Sportswear", 2),
          category("dresses", "Dresses", 3),
        ]}
      />,
    );

    expect(screen.getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual([
      "Women",
      "Men",
      "Kids",
      "Dresses",
      "Sportswear",
    ]);
    expect(screen.queryByRole("link", { name: "All" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Shorts" })).not.toBeInTheDocument();

    const women = screen.getByRole("link", { name: "Women" });
    expect(women).toHaveAttribute("data-route", "/c/$category");
    expect(women).toHaveAttribute("data-route-params", JSON.stringify({ category: "fashion" }));
    expect(women).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "PL", ref: "home", audience: "women" }),
    );

    const dresses = screen.getByRole("link", { name: "Dresses" });
    expect(dresses).toHaveAttribute("data-route-params", JSON.stringify({ category: "dresses" }));
    expect(dresses).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "PL", ref: "home", audience: "all" }),
    );
  });

  it("omits approved category tiles that are absent from live navigation", () => {
    render(
      <MarketplaceCategoryDiscovery
        audience="men"
        categories={[category("shorts", "Shorts", 1)]}
      />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: "Dresses" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sportswear" })).not.toBeInTheDocument();
  });

  it("removes a failed decorative image while preserving the tile and label", () => {
    render(<MarketplaceCategoryDiscovery audience="kids" categories={[]} />);

    const tile = screen.getByTestId("category-tile-Kids");
    const image = within(tile).getByAltText("");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("width", "1024");
    expect(image).toHaveAttribute("height", "1280");

    fireEvent.error(image);

    expect(within(tile).queryByAltText("")).not.toBeInTheDocument();
    expect(tile).toHaveClass("aspect-[4/5]", "bg-muted");
    expect(within(tile).getByText("Kids")).toBeVisible();
  });

  it.each([
    ["EN", "Explore categories", "Women", "Dresses"],
    ["PL", "Odkrywaj kategorie", "Kobiety", "Sukienki"],
    ["DE", "Kategorien entdecken", "Damen", "Kleider"],
    ["VI", "Khám phá danh mục", "Nữ", "Váy liền"],
  ] as const)("renders the %s labels", (language, heading, women, dresses) => {
    mocks.language = language;
    render(
      <MarketplaceCategoryDiscovery
        audience="women"
        categories={[category("dresses", "Canonical dresses", 1)]}
      />,
    );

    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByRole("link", { name: women })).toBeVisible();
    expect(screen.getByRole("link", { name: dresses })).toBeVisible();
  });
});

function category(slug: string, name: string, sortOrder: number) {
  return { id: `category-${slug}`, slug, name, sortOrder };
}
