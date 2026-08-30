import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ language: "EN" as "EN" | "PL" | "DE" | "VI" }));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: Record<"EN" | "PL" | "DE" | "VI", string>) => value[mocks.language],
}));

import { JoinTrustSection } from "./join-trust-section";

describe("JoinTrustSection", () => {
  beforeEach(() => {
    mocks.language = "EN";
  });

  it("renders the seller and buyer trust statements as equal repeated panels", () => {
    render(<JoinTrustSection />);

    const section = screen.getByTestId("join-trust-section");
    const panels = within(section).getAllByRole("article");
    const seller = screen.getByTestId("join-seller-trust-panel");
    const buyer = screen.getByTestId("join-buyer-trust-panel");

    expect(panels).toEqual([seller, buyer]);
    expect(seller).toHaveClass("rounded-md", "border", "bg-card");
    expect(buyer).toHaveClass("rounded-md", "border", "bg-card");
    expect(within(seller).getByRole("heading", { name: "Sellers stay in control" })).toBeVisible();
    expect(
      within(buyer).getByRole("heading", { name: "Buyers gain a clearer view" }),
    ).toBeVisible();
    expect(section).not.toHaveClass("bg-secondary", "bg-accent", "border");
    expect(seller.parentElement).toHaveClass("md:grid-cols-2");
  });

  it.each([
    [
      "EN",
      "One Network. Independent Businesses.",
      "Sellers stay in control",
      "Buyers gain a clearer view",
    ],
    [
      "PL",
      "Jedna sieć. Niezależne firmy.",
      "Sprzedawcy zachowują kontrolę",
      "Kupujący zyskują lepszy przegląd",
    ],
    [
      "DE",
      "Ein Netzwerk. Unabhängige Unternehmen.",
      "Verkäufer behalten die Kontrolle",
      "Einkäufer gewinnen einen besseren Überblick",
    ],
    [
      "VI",
      "Một mạng lưới. Các doanh nghiệp độc lập.",
      "Người bán luôn giữ quyền kiểm soát",
      "Người mua có cái nhìn rõ ràng hơn",
    ],
  ] as const)("preserves the approved %s trust copy", (language, title, seller, buyer) => {
    mocks.language = language;
    render(<JoinTrustSection />);

    expect(screen.getByRole("heading", { level: 2, name: title })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: seller })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: buyer })).toBeVisible();
  });
});
