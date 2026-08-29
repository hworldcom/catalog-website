import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  language: "EN" as "EN" | "PL" | "DE" | "VI",
  observers: [] as Array<{ disconnect: ReturnType<typeof vi.fn>; notify: () => void }>,
}));

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
      data-route-search={search ? JSON.stringify(search({ lang: "PL" })) : undefined}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: Record<"EN" | "PL" | "DE" | "VI", string>) => value[mocks.language],
}));

import { MarketplaceProductRail } from "./marketplace-product-rail";

describe("MarketplaceProductRail", () => {
  beforeEach(() => {
    mocks.language = "EN";
    mocks.observers = [];
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        private readonly callback: ResizeObserverCallback;
        readonly disconnect = vi.fn();

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
          mocks.observers.push({
            disconnect: this.disconnect,
            notify: () => this.callback([], this),
          });
        }

        observe() {}
        unobserve() {}
      },
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
  });

  it("renders every product with editorial links and a state-preserving View all action", () => {
    const products = [product(1), product(2), product(3), product(4)];
    const { container } = render(<MarketplaceProductRail audience="kids" products={products} />);

    expect(container.querySelectorAll('[data-appearance="editorial"]')).toHaveLength(4);
    expect(screen.getByRole("region", { name: "Trending products" })).toHaveClass(
      "overflow-x-auto",
      "snap-x",
    );
    expect(screen.getByRole("region", { name: "Trending products" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    const viewAll = screen.getByRole("link", { name: "View all" });
    expect(viewAll).toHaveAttribute("data-route", "/c/$category");
    expect(viewAll).toHaveAttribute("data-route-params", JSON.stringify({ category: "fashion" }));
    expect(viewAll).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "PL", audience: "kids" }),
    );
    expect(screen.getByRole("link", { name: "Supplier 4" })).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "PL", audience: "kids" }),
    );
    expect(screen.queryByTestId("product-rail-controls")).not.toBeInTheDocument();
  });

  it("shows controls only for overflow and updates their boundary states", () => {
    render(<MarketplaceProductRail audience="all" products={[product(1), product(2)]} />);
    const rail = screen.getByRole("region", { name: "Trending products" });
    const scrollBy = vi.fn();
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 1000 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollBy: { configurable: true, value: scrollBy },
    });

    act(() => mocks.observers[0]?.notify());

    const previous = screen.getByRole("button", { name: "Previous products" });
    const next = screen.getByRole("button", { name: "Next products" });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith({ left: 270, behavior: "smooth" });

    rail.scrollLeft = 700;
    fireEvent.scroll(rail);
    expect(previous).toBeEnabled();
    expect(next).toBeDisabled();

    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    fireEvent.click(previous);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -270, behavior: "auto" });

    Object.defineProperty(rail, "scrollWidth", { configurable: true, value: 300 });
    act(() => mocks.observers[0]?.notify());
    expect(screen.queryByTestId("product-rail-controls")).not.toBeInTheDocument();
  });

  it("keeps View all available while hiding the rail and controls in the empty state", () => {
    render(<MarketplaceProductRail audience="women" products={[]} />);

    expect(screen.getByText("No trending products yet. Check back soon.")).toBeVisible();
    expect(screen.getByRole("link", { name: "View all" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Trending products" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-rail-controls")).not.toBeInTheDocument();
  });

  it("does not show misleading controls when one product fits", () => {
    render(<MarketplaceProductRail audience="men" products={[product(1)]} />);
    const rail = screen.getByRole("region", { name: "Trending products" });
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 300 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    });

    act(() => mocks.observers[0]?.notify());

    expect(screen.queryByTestId("product-rail-controls")).not.toBeInTheDocument();
  });

  it.each([
    ["EN", "View all", "Trending products", "Previous products", "Next products"],
    ["PL", "Zobacz wszystkie", "Popularne produkty", "Poprzednie produkty", "Następne produkty"],
    ["DE", "Alle ansehen", "Trendprodukte", "Vorherige Produkte", "Nächste Produkte"],
    ["VI", "Xem tất cả", "Sản phẩm xu hướng", "Sản phẩm trước", "Sản phẩm tiếp theo"],
  ] as const)(
    "renders the %s rail labels",
    (language, viewAll, railLabel, previousLabel, nextLabel) => {
      mocks.language = language;
      render(<MarketplaceProductRail audience="all" products={[product(1), product(2)]} />);

      const rail = screen.getByRole("region", { name: railLabel });
      Object.defineProperties(rail, {
        clientWidth: { configurable: true, value: 300 },
        scrollWidth: { configurable: true, value: 600 },
        scrollLeft: { configurable: true, value: 0, writable: true },
        scrollBy: { configurable: true, value: vi.fn() },
      });
      act(() => mocks.observers[0]?.notify());

      expect(screen.getByRole("link", { name: viewAll })).toBeVisible();
      expect(rail).toBeVisible();
      expect(screen.getByRole("button", { name: previousLabel })).toBeDisabled();
      expect(screen.getByRole("button", { name: nextLabel })).toBeEnabled();
    },
  );
});

function product(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Product ${index}`,
    cover_image_url: null,
    price: index,
    currency: "EUR",
    moq: index,
    pack_size: `${index} pieces`,
    stock: "in_stock" as const,
    seller_id: `00000000-0000-4000-8001-${String(index).padStart(12, "0")}`,
    created_at: `2026-08-${String(index).padStart(2, "0")}T00:00:00.000Z`,
    seller_name: `Supplier ${index}`,
    seller_slug: `supplier-${index}`,
  };
}
