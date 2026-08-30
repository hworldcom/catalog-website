import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ language: "EN" as "EN" | "PL" | "DE" | "VI" }));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: Record<"EN" | "PL" | "DE" | "VI", string>) => value[mocks.language],
}));

import { MarketplaceProcessSection } from "./marketplace-process-section";

describe("MarketplaceProcessSection", () => {
  beforeEach(() => {
    mocks.language = "EN";
  });

  it("renders the numbered process with the approved decorative icons", () => {
    render(<MarketplaceProcessSection />);

    const section = screen.getByTestId("marketplace-process");
    const steps = within(section).getAllByRole("listitem");

    expect(section).toHaveClass("bg-secondary");
    expect(steps).toHaveLength(3);
    expect(within(steps[0]).getByText("01")).toBeVisible();
    expect(within(steps[1]).getByText("02")).toBeVisible();
    expect(within(steps[2]).getByText("03")).toBeVisible();
    expect(steps[0]).toHaveClass("border-b", "sm:border-r");
    expect(steps[1]).toHaveClass("border-b", "sm:border-r");
    expect(steps[2]).not.toHaveClass("border-b", "sm:border-r");

    for (const testId of ["process-icon-browse", "process-icon-inquire", "process-icon-deal"]) {
      expect(within(section).getByTestId(testId)).toHaveAttribute("aria-hidden", "true");
      expect(within(section).getByTestId(testId)).toHaveClass("size-5", "shrink-0");
    }
  });

  it.each([
    [
      "EN",
      [
        "How it works",
        "Three steps, zero fees to browse",
        "Browse",
        "Explore catalogs across categories and suppliers.",
        "Inquire",
        "Send a message or open WhatsApp with the seller directly.",
        "Deal",
        "Negotiate pricing, MOQ and shipping off-platform.",
      ],
    ],
    [
      "PL",
      [
        "Jak to działa",
        "Trzy kroki, przeglądanie za darmo",
        "Przeglądaj",
        "Przeglądaj katalogi w różnych kategoriach i u dostawców.",
        "Zapytaj",
        "Wyślij wiadomość lub otwórz WhatsApp bezpośrednio ze sprzedawcą.",
        "Umowa",
        "Negocjuj ceny, MOQ i wysyłkę poza platformą.",
      ],
    ],
    [
      "DE",
      [
        "So funktioniert's",
        "Drei Schritte, kostenloses Stöbern",
        "Stöbern",
        "Kataloge über Kategorien und Lieferanten hinweg erkunden.",
        "Anfragen",
        "Nachricht senden oder WhatsApp direkt mit dem Verkäufer öffnen.",
        "Abschluss",
        "Preis, MBM und Versand außerhalb der Plattform aushandeln.",
      ],
    ],
    [
      "VI",
      [
        "Cách hoạt động",
        "Ba bước, duyệt miễn phí",
        "Duyệt",
        "Khám phá danh mục theo phân loại và nhà cung cấp.",
        "Yêu cầu",
        "Gửi tin nhắn hoặc mở WhatsApp trực tiếp với nhà bán.",
        "Chốt đơn",
        "Thương lượng giá, SL tối thiểu và vận chuyển ngoài nền tảng.",
      ],
    ],
  ] as const)("preserves all existing %s process copy", (language, copy) => {
    mocks.language = language;
    render(<MarketplaceProcessSection />);

    for (const text of copy) expect(screen.getByText(text)).toBeVisible();
  });
});
