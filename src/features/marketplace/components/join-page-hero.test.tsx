import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ language: "EN" as "EN" | "PL" | "DE" | "VI" }));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: Record<"EN" | "PL" | "DE" | "VI", string>) => value[mocks.language],
}));

import { JoinPageHero } from "./join-page-hero";

describe("JoinPageHero", () => {
  beforeEach(() => {
    mocks.language = "EN";
    window.history.replaceState({}, "", "/join?lang=EN&audience=all");
  });

  it("renders the centered warm hero with buyer-first jump actions", () => {
    render(<JoinPageHero />);

    const hero = screen.getByTestId("join-page-hero");
    const actions = within(hero).getAllByRole("link");

    expect(hero).toHaveClass("bg-accent", "text-center");
    expect(hero).not.toHaveClass("bg-gradient-to-b");
    expect(
      screen.getByRole("heading", { level: 1, name: "Join the Wholesale Network" }),
    ).toBeVisible();
    expect(actions.map((action) => action.textContent)).toEqual(["I'm a buyer", "I'm a seller"]);
    expect(actions[0]).toHaveAttribute("href", "#for-buyers");
    expect(actions[0]).toHaveAttribute("aria-controls", "for-buyers");
    expect(actions[1]).toHaveAttribute("href", "#for-sellers");
    expect(actions[1]).toHaveAttribute("aria-controls", "for-sellers");
    expect(actions[0]).toHaveClass("min-h-11");
    expect(actions[1]).toHaveClass("min-h-11");
  });

  it("moves focus to each detail section when its jump action is activated", () => {
    render(
      <>
        <JoinPageHero />
        <section id="for-buyers" tabIndex={-1} />
        <section id="for-sellers" tabIndex={-1} />
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "I'm a buyer" }));
    expect(document.getElementById("for-buyers")).toHaveFocus();

    fireEvent.click(screen.getByRole("link", { name: "I'm a seller" }));
    expect(document.getElementById("for-sellers")).toHaveFocus();
  });

  it.each([
    [
      "EN",
      "Join the Wholesale Network",
      "Bringing Europe's traditional wholesale centres online.",
      "I'm a buyer",
      "I'm a seller",
    ],
    [
      "PL",
      "Dołącz do sieci hurtowej",
      "Przenosimy tradycyjne europejskie centra hurtowe do internetu.",
      "Jestem kupującym",
      "Jestem sprzedawcą",
    ],
    [
      "DE",
      "Werden Sie Teil des Großhandelsnetzwerks",
      "Wir bringen Europas traditionelle Großhandelszentren online.",
      "Ich kaufe ein",
      "Ich verkaufe",
    ],
    [
      "VI",
      "Tham gia mạng lưới bán buôn",
      "Đưa các trung tâm bán buôn truyền thống của châu Âu lên trực tuyến.",
      "Tôi là người mua",
      "Tôi là người bán",
    ],
  ] as const)("preserves the existing %s hero copy", (language, title, kicker, buyer, seller) => {
    mocks.language = language;
    render(<JoinPageHero />);

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeVisible();
    expect(screen.getByText(kicker)).toBeVisible();
    expect(screen.getByRole("link", { name: buyer })).toBeVisible();
    expect(screen.getByRole("link", { name: seller })).toBeVisible();
  });
});
