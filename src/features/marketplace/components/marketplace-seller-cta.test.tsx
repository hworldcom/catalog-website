import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ language: "EN" as "EN" | "PL" | "DE" | "VI" }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    to,
    ...props
  }: {
    children: ReactNode;
    search?: (previous: Record<string, unknown>) => Record<string, unknown>;
    to: string;
    [key: string]: unknown;
  }) => (
    <a
      {...props}
      href="#test"
      data-route={to}
      data-route-search={
        search
          ? JSON.stringify(search({ lang: "PL", audience: "kids", ref: "homepage" }))
          : undefined
      }
    >
      {children}
    </a>
  ),
}));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: Record<"EN" | "PL" | "DE" | "VI", string>) => value[mocks.language],
}));

import { MarketplaceSellerCta } from "./marketplace-seller-cta";

describe("MarketplaceSellerCta", () => {
  beforeEach(() => {
    mocks.language = "EN";
  });

  it("uses the seller account route while retaining the current search state", () => {
    render(<MarketplaceSellerCta />);

    const section = screen.getByTestId("marketplace-seller-cta");
    const action = screen.getByRole("link", { name: "Create seller account" });

    expect(section).toHaveClass("bg-accent");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(action).toHaveAttribute("data-route", "/auth");
    expect(action).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "PL", audience: "kids", ref: "homepage" }),
    );
    expect(action).toHaveClass("min-h-11", "bg-primary");
  });

  it.each([
    [
      "EN",
      "Sell wholesale on Bazoria",
      "Create a branded catalog, showcase your products, and capture buyer inquiries from retailers and resellers — right from your phone.",
      "Create seller account",
    ],
    [
      "PL",
      "Sprzedawaj hurtowo na Bazoria",
      "Stwórz markowy katalog, pokaż produkty i zbieraj zapytania od sklepów i resellerów — prosto z telefonu.",
      "Utwórz konto sprzedawcy",
    ],
    [
      "DE",
      "Großhandel auf Bazoria verkaufen",
      "Erstellen Sie einen Markenkatalog, präsentieren Sie Ihre Produkte und erhalten Sie Käuferanfragen von Händlern und Wiederverkäufern — direkt vom Handy.",
      "Verkäuferkonto erstellen",
    ],
    [
      "VI",
      "Bán buôn trên Bazoria",
      "Tạo danh mục có thương hiệu, giới thiệu sản phẩm và nhận yêu cầu từ nhà bán lẻ và reseller — ngay trên điện thoại.",
      "Tạo tài khoản người bán",
    ],
  ] as const)("preserves the existing %s seller copy", (language, title, lead, action) => {
    mocks.language = language;
    render(<MarketplaceSellerCta />);

    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByText(lead)).toBeVisible();
    expect(screen.getByRole("link", { name: action })).toBeVisible();
  });
});
