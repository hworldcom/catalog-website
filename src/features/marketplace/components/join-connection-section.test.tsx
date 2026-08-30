import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ language: "EN" as "EN" | "PL" | "DE" | "VI" }));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: Record<"EN" | "PL" | "DE" | "VI", string>) => value[mocks.language],
}));

import { JoinConnectionSection } from "./join-connection-section";

describe("JoinConnectionSection", () => {
  beforeEach(() => {
    mocks.language = "EN";
  });

  it("renders the approved unframed connection sequence", () => {
    render(<JoinConnectionSection />);

    const section = screen.getByTestId("join-connection-section");
    const list = screen.getByTestId("join-connection-steps");
    const steps = within(list).getAllByRole("listitem");

    expect(section).toHaveClass("bg-secondary");
    expect(list).toHaveClass("md:grid-cols-3");
    expect(
      steps.map((step) => within(step).getByRole("heading", { level: 3 }).textContent),
    ).toEqual(["Seller publishes", "Buyer discovers", "Both sides connect"]);
    expect(steps.map((step, index) => within(step).getByText(`0${index + 1}`).textContent)).toEqual(
      ["01", "02", "03"],
    );
    expect(steps[0]).not.toHaveClass("border-t", "md:border-l");
    expect(steps[1]).toHaveClass("border-t", "md:border-l", "md:border-t-0");
    expect(steps[2]).toHaveClass("border-t", "md:border-l", "md:border-t-0");
    expect(within(section).queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByText("Browse online. Trade however works for you.")).toBeVisible();
  });

  it("uses decorative icons for the three visible steps", () => {
    render(<JoinConnectionSection />);

    for (const number of ["01", "02", "03"]) {
      expect(screen.getByTestId(`join-connection-icon-${number}`)).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
  });

  it.each([
    [
      "EN",
      "One simple path from catalogue to conversation.",
      "Seller publishes",
      "Browse online. Trade however works for you.",
    ],
    [
      "PL",
      "Prosta droga od katalogu do rozmowy.",
      "Sprzedawca publikuje",
      "Przeglądaj online. Handluj tak, jak Ci wygodnie.",
    ],
    [
      "DE",
      "Ein einfacher Weg vom Katalog zum Gespräch.",
      "Verkäufer veröffentlicht",
      "Online stöbern. Handeln, wie es für Sie passt.",
    ],
    [
      "VI",
      "Một hành trình đơn giản từ danh mục đến cuộc trao đổi.",
      "Người bán công bố",
      "Xem hàng trực tuyến. Giao dịch theo cách phù hợp với bạn.",
    ],
  ] as const)(
    "preserves the approved %s connection copy",
    (language, title, firstStep, promise) => {
      mocks.language = language;
      render(<JoinConnectionSection />);

      expect(screen.getByRole("heading", { level: 2, name: title })).toBeVisible();
      expect(screen.getByRole("heading", { level: 3, name: firstStep })).toBeVisible();
      expect(screen.getByText(promise)).toBeVisible();
    },
  );
});
