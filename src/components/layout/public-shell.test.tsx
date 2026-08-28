import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    to,
    ...props
  }: {
    children: ReactNode;
    search?: (previous: Record<string, unknown>) => Record<string, unknown>;
    to?: string;
    [key: string]: unknown;
  }) => {
    const resolvedSearch = search?.({ lang: "DE", audience: "kids" });
    return (
      <a
        {...props}
        href={to ?? "/"}
        data-route-search={resolvedSearch ? JSON.stringify(resolvedSearch) : undefined}
      >
        {children}
      </a>
    );
  },
}));

vi.mock("@/features/marketplace/components/marketplace-navigation", () => ({
  MarketplaceNavigation: ({ audience }: { audience: string }) => (
    <div data-testid="marketplace-navigation" data-audience={audience} />
  ),
}));

vi.mock("@/lib/i18n", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: { EN: string }) => value.EN,
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import { PublicShell } from "./public-shell";

describe("PublicShell marketplace navigation", () => {
  it("renders audience navigation on marketplace surfaces", () => {
    render(
      <PublicShell marketplaceAudience="kids">
        <p>Marketplace content</p>
      </PublicShell>,
    );

    expect(screen.getByTestId("marketplace-navigation")).toHaveAttribute("data-audience", "kids");
  });

  it("keeps authentication and generic pages independent of marketplace reads", () => {
    render(
      <PublicShell>
        <p>Authentication content</p>
      </PublicShell>,
    );

    expect(screen.queryByTestId("marketplace-navigation")).not.toBeInTheDocument();
  });

  it("renders the signed-out navigation action as a prominent orange button", async () => {
    render(
      <PublicShell marketplaceAudience="women">
        <p>Marketplace content</p>
      </PublicShell>,
    );

    const signIn = await screen.findByRole("link", { name: "Sign in" });
    expect(signIn).toHaveAttribute("href", "/auth");
    expect(signIn).toHaveClass("bg-orange-600", "border-orange-600", "text-white");
  });

  it("resets the logo and Home destinations to All while preserving language", () => {
    render(
      <PublicShell marketplaceAudience="kids">
        <p>Marketplace content</p>
      </PublicShell>,
    );

    const expected = JSON.stringify({ lang: "DE", audience: "all" });
    const logoLink = screen.getByRole("link", { name: "Bazoria" });
    expect(logoLink).toHaveAttribute("data-route-search", expected);
    expect(screen.getByRole("img", { name: "Bazoria" })).toHaveAttribute(
      "src",
      "/assets/brand/bazoria-logo.svg",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "data-route-search",
      expected,
    );
  });
});
