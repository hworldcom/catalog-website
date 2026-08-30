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

import { JoinAudiencePanels } from "./join-audience-panels";

describe("JoinAudiencePanels", () => {
  beforeEach(() => {
    mocks.language = "EN";
  });

  it("renders the approved buyer-first content from the shared copy contract", () => {
    render(<JoinAudiencePanels audience="kids" />);

    const panels = screen.getAllByRole("article");
    const buyer = screen.getByTestId("join-buyer-panel");
    const seller = screen.getByTestId("join-seller-panel");

    expect(panels).toEqual([buyer, seller]);
    expect(within(buyer).getByRole("heading", { name: "For buyers" })).toBeVisible();
    expect(within(buyer).getByText("Discover new wholesalers")).toBeVisible();
    expect(within(buyer).getByText("Browse current catalogues")).toBeVisible();
    expect(within(buyer).getByText("Browse before travelling")).toBeVisible();
    expect(within(buyer).getByText("Source closer to home")).toBeVisible();
    expect(within(buyer).getByText("No buyer account required.")).toBeVisible();
    expect(within(seller).getByRole("heading", { name: "For sellers" })).toBeVisible();
    expect(within(seller).getByText("Create your digital catalogue")).toBeVisible();
    expect(within(seller).getByText("Share products anywhere")).toBeVisible();
    expect(within(seller).getByText("Reach new professional buyers")).toBeVisible();
    expect(within(seller).getByText("Keep selling your way")).toBeVisible();
    expect(screen.getByTestId("join-buyer-panel-icon")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("join-seller-panel-icon")).toHaveAttribute("aria-hidden", "true");
  });

  it("sends buyers to the selected-audience catalogue and sellers to authentication", () => {
    render(<JoinAudiencePanels audience="kids" />);

    const browse = screen.getByRole("link", { name: "Browse products" });
    expect(browse).toHaveAttribute("data-route", "/c/$category");
    expect(browse).toHaveAttribute("data-route-params", JSON.stringify({ category: "fashion" }));
    expect(browse).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "kids", ref: "join" }),
    );

    const createAccount = screen.getByRole("link", { name: "Create seller account" });
    expect(createAccount).toHaveAttribute("data-route", "/auth");
    expect(createAccount).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "women", ref: "join" }),
    );
    expect(browse).toHaveClass("min-h-11");
    expect(createAccount).toHaveClass("min-h-11");
  });

  it.each([
    ["EN", "For buyers", "Discover new wholesalers", "No buyer account required.", "For sellers"],
    [
      "PL",
      "Dla kupujących",
      "Odkrywaj nowych hurtowników",
      "Konto kupującego nie jest wymagane.",
      "Dla sprzedawców",
    ],
    [
      "DE",
      "Für Einkäufer",
      "Neue Großhändler entdecken",
      "Kein Käuferkonto erforderlich.",
      "Für Verkäufer",
    ],
    [
      "VI",
      "Dành cho người mua",
      "Khám phá nhà bán buôn mới",
      "Không cần tài khoản người mua.",
      "Dành cho người bán",
    ],
  ] as const)("renders the shared %s audience copy", (language, buyer, benefit, note, seller) => {
    mocks.language = language;
    render(<JoinAudiencePanels audience="all" />);

    expect(screen.getByRole("heading", { name: buyer })).toBeVisible();
    expect(screen.getByText(benefit)).toBeVisible();
    expect(screen.getByText(note)).toBeVisible();
    expect(screen.getByRole("heading", { name: seller })).toBeVisible();
  });
});
