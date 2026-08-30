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
      data-route-search={search ? JSON.stringify(search({ lang: "DE" })) : undefined}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: Record<"EN" | "PL" | "DE" | "VI", string>) => value[mocks.language],
}));

import { MarketplaceHomeHero } from "./marketplace-home-hero";

describe("MarketplaceHomeHero", () => {
  beforeEach(() => {
    mocks.language = "EN";
  });

  it("renders the approved actions and translated trust content", () => {
    render(<MarketplaceHomeHero audience="women" />);

    expect(
      screen.getByRole("heading", { name: "Find wholesale products from real suppliers." }),
    ).toHaveClass("break-words");
    expect(screen.getByText("Independent wholesalers with real catalogs.")).toBeVisible();
    expect(screen.getByText("Inquire and negotiate with sellers directly.")).toBeVisible();
    expect(screen.getByText("Discover products across markets.")).toBeVisible();

    const browse = screen.getByRole("link", { name: "Browse products" });
    expect(browse).toHaveAttribute("data-route", "/c/$category");
    expect(browse).toHaveAttribute("data-route-params", JSON.stringify({ category: "fashion" }));
    expect(browse).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "women" }),
    );

    const join = screen.getByRole("link", { name: "Join the network" });
    expect(join).toHaveAttribute("data-route", "/join");
    expect(join).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "women" }),
    );
    expect(screen.queryByRole("link", { name: "Sell on Bazoria" })).not.toBeInTheDocument();
  });

  it("keeps imagery decorative and gives only the primary image eager priority", () => {
    render(<MarketplaceHomeHero audience="all" />);

    expect(screen.queryAllByRole("img")).toHaveLength(0);

    const rack = within(screen.getByTestId("hero-image-rack")).getByAltText("");
    const woman = within(screen.getByTestId("hero-image-woman")).getByAltText("");
    const handbag = within(screen.getByTestId("hero-image-handbag")).getByAltText("");

    expect(rack).toHaveAttribute("loading", "eager");
    expect(rack).toHaveAttribute("fetchpriority", "high");
    expect(woman).toHaveAttribute("loading", "lazy");
    expect(woman).not.toHaveAttribute("fetchpriority");
    expect(handbag).toHaveAttribute("loading", "lazy");
    expect(handbag).not.toHaveAttribute("fetchpriority");
  });

  it("removes a failed image without removing its reserved tile", () => {
    render(<MarketplaceHomeHero audience="men" />);

    const rackTile = screen.getByTestId("hero-image-rack");
    const rack = within(rackTile).getByAltText("");

    fireEvent.error(rack);

    expect(within(rackTile).queryByAltText("")).not.toBeInTheDocument();
    expect(rackTile).toHaveClass("bg-muted", "col-span-2");
    expect(screen.getByTestId("marketplace-hero-collage")).toHaveClass("h-[280px]");
  });

  it("removes an image that failed before hydration attached its error handler", () => {
    const { rerender } = render(<MarketplaceHomeHero audience="all" />);
    const rackTile = screen.getByTestId("hero-image-rack");
    const rack = within(rackTile).getByAltText("");
    markImageAsAlreadyFailed(rack);

    rerender(<MarketplaceHomeHero audience="all" />);

    expect(within(rackTile).queryByAltText("")).not.toBeInTheDocument();
    expect(rackTile).toHaveClass("bg-muted", "col-span-2");
  });

  it.each([
    ["EN", "Browse products", "Join the network", "Real suppliers"],
    ["PL", "Przeglądaj produkty", "Dołącz do sieci", "Prawdziwi dostawcy"],
    ["DE", "Produkte durchsuchen", "Netzwerk beitreten", "Echte Lieferanten"],
    ["VI", "Xem sản phẩm", "Tham gia mạng lưới", "Nhà cung cấp thật"],
  ] as const)("renders the %s actions and trust label", (language, browse, join, trust) => {
    mocks.language = language;
    render(<MarketplaceHomeHero audience="all" />);

    expect(screen.getByRole("link", { name: browse })).toBeVisible();
    expect(screen.getByRole("link", { name: join })).toBeVisible();
    expect(screen.getByText(trust)).toBeVisible();
  });
});

function markImageAsAlreadyFailed(image: HTMLElement) {
  Object.defineProperties(image, {
    complete: { configurable: true, value: true },
    naturalWidth: { configurable: true, value: 0 },
  });
}
