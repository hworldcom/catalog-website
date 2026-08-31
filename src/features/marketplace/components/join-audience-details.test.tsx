import { render, screen, within } from "@testing-library/react";
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
      data-route-search={search ? JSON.stringify(search({ lang: "DE", ref: "join" })) : undefined}
      data-route-search-existing={
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

import { JoinAudienceDetails } from "./join-audience-details";

describe("JoinAudienceDetails", () => {
  beforeEach(() => {
    mocks.language = "EN";
  });

  it("renders seller details, onboarding, and buyer details in the fixed order", () => {
    render(<JoinAudienceDetails audience="kids" />);

    const seller = screen.getByTestId("join-seller-details");
    const onboarding = screen.getByTestId("join-seller-onboarding");
    const buyer = screen.getByTestId("join-buyer-details");

    expect(seller.compareDocumentPosition(onboarding)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(onboarding.compareDocumentPosition(buyer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    expect(
      within(seller)
        .getAllByRole("heading", { level: 3 })
        .map((item) => item.textContent),
    ).toEqual([
      "Create your digital catalogue",
      "Share products anywhere",
      "Open the rest of your range",
      "Reach new professional buyers",
      "Keep selling your way",
    ]);
    expect(
      within(onboarding)
        .getAllByRole("heading", { level: 3 })
        .map((item) => item.textContent),
    ).toEqual(["Create your account", "Set up your seller profile", "Build your catalogue"]);
    expect(
      within(buyer)
        .getAllByRole("heading", { level: 3 })
        .map((item) => item.textContent),
    ).toEqual([
      "Discover new wholesalers",
      "Browse current catalogues",
      "Browse before travelling",
      "Source closer to home",
    ]);
  });

  it("advertises only email and password account creation", () => {
    render(<JoinAudienceDetails audience="all" />);

    expect(screen.getByText("Sign up with email and password.")).toBeVisible();
    expect(screen.queryByText(/Google/u)).not.toBeInTheDocument();
  });

  it("preserves the anchor focus contract and responsive numbered-list presentation", () => {
    render(<JoinAudienceDetails audience="all" />);

    const seller = screen.getByTestId("join-seller-details");
    const onboarding = screen.getByTestId("join-seller-onboarding");
    const buyer = screen.getByTestId("join-buyer-details");

    expect(seller).toHaveAttribute("id", "for-sellers");
    expect(seller).toHaveAttribute("tabindex", "-1");
    expect(seller).toHaveClass("scroll-mt-48", "focus:ring-2");
    expect(buyer).toHaveAttribute("id", "for-buyers");
    expect(buyer).toHaveAttribute("tabindex", "-1");
    expect(buyer).toHaveClass("scroll-mt-48", "focus:ring-2");
    expect(within(seller).getByRole("list")).toHaveClass("md:grid-cols-2");
    expect(within(buyer).getByRole("list")).toHaveClass("md:grid-cols-2");
    expect(onboarding).toHaveClass("bg-secondary");
    expect(within(onboarding).getByRole("list")).toHaveClass("md:grid-cols-3");
    expect(within(onboarding).queryByRole("article")).not.toBeInTheDocument();
  });

  it("renders decorative onboarding icons and retains seller authentication state", () => {
    render(<JoinAudienceDetails audience="kids" />);

    for (const number of ["01", "02", "03"]) {
      expect(screen.getByTestId(`join-onboarding-icon-${number}`)).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    const action = screen.getByRole("link", { name: "Create seller account" });
    expect(action).toHaveAttribute("data-route", "/auth");
    expect(action).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", ref: "join", audience: "kids" }),
    );
    expect(action).toHaveAttribute(
      "data-route-search-existing",
      JSON.stringify({ lang: "DE", audience: "women", ref: "join" }),
    );
    expect(action).toHaveClass("min-h-11");
  });

  it.each([
    [
      "EN",
      "Show more. Send less. Reach further.",
      "Upload once. Share everywhere.",
      "Start selling in three steps",
      "Discover more. Search faster. Source closer.",
    ],
    [
      "PL",
      "Pokaż więcej. Wysyłaj mniej. Docieraj dalej.",
      "Dodaj raz. Udostępniaj wszędzie.",
      "Zacznij sprzedawać w trzech krokach",
      "Odkrywaj więcej. Szukaj szybciej. Kupuj bliżej.",
    ],
    [
      "DE",
      "Mehr zeigen. Weniger senden. Weiter reichen.",
      "Einmal hochladen. Überall teilen.",
      "In drei Schritten mit dem Verkauf starten",
      "Mehr entdecken. Schneller suchen. Näher beschaffen.",
    ],
    [
      "VI",
      "Trưng bày nhiều hơn. Gửi ít hơn. Vươn xa hơn.",
      "Tải lên một lần. Chia sẻ mọi nơi.",
      "Bắt đầu bán hàng trong ba bước",
      "Khám phá nhiều hơn. Tìm nhanh hơn. Lấy hàng gần hơn.",
    ],
  ] as const)(
    "preserves the approved %s section copy",
    (language, sellerTitle, promise, onboardingTitle, buyerTitle) => {
      mocks.language = language;
      render(<JoinAudienceDetails audience="all" />);

      expect(screen.getByRole("heading", { name: sellerTitle })).toBeVisible();
      expect(screen.getByText(promise)).toBeVisible();
      expect(screen.getByRole("heading", { name: onboardingTitle })).toBeVisible();
      expect(screen.getByRole("heading", { name: buyerTitle })).toBeVisible();
    },
  );
});
