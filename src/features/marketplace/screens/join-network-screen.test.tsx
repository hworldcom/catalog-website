import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/components/layout/public-shell", () => ({
  PublicShell: ({
    children,
    marketplaceAudience,
  }: {
    children: ReactNode;
    marketplaceAudience: string;
  }) => (
    <div data-testid="public-shell" data-audience={marketplaceAudience}>
      {children}
    </div>
  ),
}));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: { EN: string }) => value.EN,
}));

import { JoinNetworkScreen } from "./join-network-screen";

describe("JoinNetworkScreen", () => {
  it("presents distinct seller and buyer paths inside the public marketplace shell", () => {
    render(<JoinNetworkScreen audience="kids" />);

    expect(screen.getByTestId("public-shell")).toHaveAttribute("data-audience", "kids");
    const orderedSections = [
      screen.getByTestId("join-page-hero"),
      screen.getByTestId("join-audience-panels"),
      screen.getByTestId("join-seller-details"),
      screen.getByTestId("join-seller-onboarding"),
      screen.getByTestId("join-buyer-details"),
      screen.getByTestId("join-connection-section"),
      screen.getByTestId("join-trust-section"),
      screen.getByTestId("join-final-cta"),
    ];
    for (let index = 0; index < orderedSections.length - 1; index += 1) {
      expect(orderedSections[index].compareDocumentPosition(orderedSections[index + 1])).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    expect(
      screen.getByRole("heading", { level: 1, name: "Join the Wholesale Network" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "I'm a seller" })).toHaveAttribute(
      "href",
      "#for-sellers",
    );
    expect(screen.getByRole("link", { name: "I'm a buyer" })).toHaveAttribute(
      "href",
      "#for-buyers",
    );
    expect(document.getElementById("for-sellers")).toHaveAttribute("tabindex", "-1");
    expect(document.getElementById("for-buyers")).toHaveAttribute("tabindex", "-1");
    expect(document.getElementById("for-sellers")).toHaveClass("scroll-mt-48", "focus:ring-2");
    expect(document.getElementById("for-buyers")).toHaveClass("scroll-mt-48", "focus:ring-2");
    const sellerSection = within(document.getElementById("for-sellers")!);
    const onboardingSection = within(screen.getByTestId("join-seller-onboarding"));
    expect(
      sellerSection.getByRole("heading", { name: "Show more. Send less. Reach further." }),
    ).toBeVisible();
    expect(
      onboardingSection.getByRole("heading", { name: "Start selling in three steps" }),
    ).toBeVisible();
    expect(onboardingSection.getByRole("heading", { name: "Create your account" })).toBeVisible();
    expect(
      onboardingSection.getByRole("heading", { name: "Set up your seller profile" }),
    ).toBeVisible();
    expect(onboardingSection.getByRole("heading", { name: "Build your catalogue" })).toBeVisible();
    expect(onboardingSection.getByRole("link", { name: "Create seller account" })).toHaveAttribute(
      "data-route",
      "/auth",
    );
    expect(
      screen.getByRole("heading", { name: "Discover more. Search faster. Source closer." }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "One simple path from catalogue to conversation." }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "One Network. Independent Businesses." }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Take the next step with Bazoria." })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Seller publishes" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sellers stay in control" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Buyers gain a clearer view" })).toBeVisible();
  });

  it("sends sellers to authentication and buyers to the selected audience catalogue", () => {
    render(<JoinNetworkScreen audience="kids" />);

    const browseActions = screen.getAllByRole("link", { name: "Browse products" });
    expect(browseActions).toHaveLength(2);
    for (const browse of browseActions) {
      expect(browse).toHaveAttribute("data-route", "/c/$category");
      expect(browse).toHaveAttribute("data-route-params", JSON.stringify({ category: "fashion" }));
      expect(browse).toHaveAttribute(
        "data-route-search",
        JSON.stringify({ lang: "DE", audience: "kids", ref: "join" }),
      );
    }

    const sellerAccounts = screen.getAllByRole("link", { name: "Create seller account" });
    expect(sellerAccounts).toHaveLength(3);
    for (const action of sellerAccounts) {
      expect(action).toHaveAttribute("data-route", "/auth");
      expect(action).toHaveAttribute(
        "data-route-search",
        JSON.stringify({ lang: "DE", audience: "women", ref: "join" }),
      );
    }
    expect(screen.queryByRole("link", { name: "Sell on Bazoria" })).not.toBeInTheDocument();
  });

  it("does not advertise unsupported buyer or transaction features", () => {
    render(<JoinNetworkScreen audience="women" />);

    expect(screen.queryByText(/follow your suppliers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/new-arrival notifications/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/seller analytics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/checkout/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/no buyer account required/i)).toHaveLength(2);
  });
});
