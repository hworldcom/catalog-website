import { render, screen, within } from "@testing-library/react";
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
      data-route-search={
        search ? JSON.stringify(search({ lang: "DE", audience: "women", ref: "join" })) : undefined
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

import { JoinFinalCta } from "./join-final-cta";

describe("JoinFinalCta", () => {
  beforeEach(() => {
    mocks.language = "EN";
  });

  it("renders the centered accent band with seller-first actions", () => {
    render(<JoinFinalCta audience="kids" />);

    const section = screen.getByTestId("join-final-cta");
    const actions = within(section).getAllByRole("link");
    const heading = within(section).getByRole("heading", {
      level: 2,
      name: "Take the next step with Bazoria.",
    });

    expect(section).toHaveClass("bg-accent");
    expect(heading.parentElement).toHaveClass("mx-auto", "text-center");
    expect(actions.map((action) => action.textContent)).toEqual([
      "Create seller account",
      "Browse products",
    ]);
    expect(actions[0]).toHaveClass("min-h-11", "bg-primary");
    expect(actions[1]).toHaveClass("min-h-11", "border");
    expect(actions[0].parentElement).toHaveClass("flex-col", "sm:flex-row");
    expect(screen.queryByRole("link", { name: "Sell on Bazoria" })).not.toBeInTheDocument();
  });

  it("preserves complete search state and applies the current audience to browsing", () => {
    render(<JoinFinalCta audience="kids" />);

    const seller = screen.getByRole("link", { name: "Create seller account" });
    const buyer = screen.getByRole("link", { name: "Browse products" });

    expect(seller).toHaveAttribute("data-route", "/auth");
    expect(seller).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "women", ref: "join" }),
    );
    expect(buyer).toHaveAttribute("data-route", "/c/$category");
    expect(buyer).toHaveAttribute("data-route-params", JSON.stringify({ category: "fashion" }));
    expect(buyer).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "kids", ref: "join" }),
    );
  });

  it.each([
    [
      "EN",
      "Take the next step with Bazoria.",
      "Create a seller account or start exploring the wholesale catalogue—no buyer account required.",
      "Create seller account",
      "Browse products",
    ],
    [
      "PL",
      "Zrób kolejny krok z Bazoria.",
      "Utwórz konto sprzedawcy lub zacznij przeglądać katalog hurtowy — konto kupującego nie jest wymagane.",
      "Utwórz konto sprzedawcy",
      "Przeglądaj produkty",
    ],
    [
      "DE",
      "Machen Sie den nächsten Schritt mit Bazoria.",
      "Erstellen Sie ein Verkäuferkonto oder entdecken Sie den Großhandelskatalog – ganz ohne Käuferkonto.",
      "Verkäuferkonto erstellen",
      "Produkte durchsuchen",
    ],
    [
      "VI",
      "Bắt đầu bước tiếp theo cùng Bazoria.",
      "Tạo tài khoản người bán hoặc bắt đầu khám phá danh mục bán buôn — không cần tài khoản người mua.",
      "Tạo tài khoản người bán",
      "Xem sản phẩm",
    ],
  ] as const)(
    "preserves the approved %s final action copy",
    (language, title, lead, seller, buyer) => {
      mocks.language = language;
      render(<JoinFinalCta audience="all" />);

      expect(screen.getByRole("heading", { level: 2, name: title })).toBeVisible();
      expect(screen.getByText(lead)).toBeVisible();
      expect(screen.getByRole("link", { name: seller })).toBeVisible();
      expect(screen.getByRole("link", { name: buyer })).toBeVisible();
    },
  );
});
