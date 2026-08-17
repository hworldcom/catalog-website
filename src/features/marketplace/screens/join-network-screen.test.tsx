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
        search ? JSON.stringify(search({ lang: "DE", audience: "women" })) : undefined
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
    const sellerSection = within(document.getElementById("for-sellers")!);
    expect(
      sellerSection.getByRole("heading", { name: "Start selling in three steps" }),
    ).toBeVisible();
    expect(sellerSection.getByRole("heading", { name: "Create your account" })).toBeVisible();
    expect(
      sellerSection.getByRole("heading", { name: "Set up your seller profile" }),
    ).toBeVisible();
    expect(sellerSection.getByRole("heading", { name: "Build your catalogue" })).toBeVisible();
    expect(sellerSection.getByRole("link", { name: "Create seller account" })).toHaveAttribute(
      "data-route",
      "/auth",
    );
  });

  it("sends sellers to authentication and buyers to the selected audience catalogue", () => {
    render(<JoinNetworkScreen audience="kids" />);

    const sell = screen.getByRole("link", { name: "Sell on Bazoria" });
    expect(sell).toHaveAttribute("data-route", "/auth");
    expect(sell).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "women" }),
    );

    const browse = screen.getByRole("link", { name: "Browse products" });
    expect(browse).toHaveAttribute("data-route", "/c/$category");
    expect(browse).toHaveAttribute("data-route-params", JSON.stringify({ category: "fashion" }));
    expect(browse).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "kids" }),
    );
  });

  it("does not advertise unsupported buyer or transaction features", () => {
    render(<JoinNetworkScreen audience="women" />);

    expect(screen.queryByText(/follow your suppliers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/new-arrival notifications/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/seller analytics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/checkout/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no buyer account required/i)).toBeVisible();
  });
});
