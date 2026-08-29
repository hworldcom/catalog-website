import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

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
  LanguageSwitcher: ({ appearance }: { appearance?: string }) => (
    <div data-testid="language-switcher" data-appearance={appearance} />
  ),
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: { EN: string }) => value.EN,
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: authMocks.getUser,
      onAuthStateChange: authMocks.onAuthStateChange,
    },
  },
}));

import { PublicShell } from "./public-shell";

describe("PublicShell marketplace navigation", () => {
  beforeEach(() => {
    authMocks.getUser.mockReset();
    authMocks.getUser.mockResolvedValue({ data: { user: null } });
    authMocks.onAuthStateChange.mockReset();
    authMocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: authMocks.unsubscribe } },
    });
    authMocks.unsubscribe.mockReset();
  });

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

  it("uses the isolated public theme and public-header language appearance", () => {
    const { container } = render(
      <PublicShell>
        <p>Public content</p>
      </PublicShell>,
    );

    expect(container.firstElementChild).toHaveClass("public-marketplace");
    expect(container.firstElementChild).not.toHaveClass("storefront-dark");
    expect(screen.getByTestId("language-switcher")).toHaveAttribute(
      "data-appearance",
      "publicHeader",
    );
  });

  it("renders the signed-out navigation action with the black action treatment", async () => {
    render(
      <PublicShell marketplaceAudience="women">
        <p>Marketplace content</p>
      </PublicShell>,
    );

    const signIn = await screen.findByRole("link", { name: "Sign in" });
    expect(signIn).toHaveAttribute("href", "/auth");
    expect(signIn).toHaveClass("min-h-11", "border-foreground", "bg-foreground", "text-card");
  });

  it("renders the signed-in seller action with the same black treatment", async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: { id: "seller-1" } } });
    render(
      <PublicShell>
        <p>Seller content</p>
      </PublicShell>,
    );

    const dashboard = await screen.findByRole("link", { name: "Seller dashboard" });
    expect(dashboard).toHaveAttribute("href", "/seller");
    expect(dashboard).toHaveClass("min-h-11", "border-foreground", "bg-foreground", "text-card");
  });

  it("renders no authentication action while the initial session is unresolved", () => {
    authMocks.getUser.mockReturnValue(new Promise(() => {}));
    render(
      <PublicShell>
        <p>Loading content</p>
      </PublicShell>,
    );

    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Seller dashboard" })).not.toBeInTheDocument();
  });

  it("uses the logo as the only home destination and resets All while preserving language", () => {
    const { container } = render(
      <PublicShell marketplaceAudience="kids">
        <p>Marketplace content</p>
      </PublicShell>,
    );

    const expected = JSON.stringify({ lang: "DE", audience: "all" });
    const logoLink = screen.getByRole("link", { name: "Bazoria" });
    expect(logoLink).toHaveAttribute("data-route-search", expected);
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    const mobileLogo = container.querySelector('img[src="/favicon.svg"]');
    const desktopLogo = container.querySelector('img[src="/assets/brand/bazoria-logo.svg"]');
    expect(mobileLogo).toHaveAttribute("alt", "");
    expect(mobileLogo).toHaveAttribute("aria-hidden", "true");
    expect(mobileLogo).toHaveClass("sm:hidden");
    expect(desktopLogo).toHaveAttribute("alt", "");
    expect(desktopLogo).toHaveAttribute("aria-hidden", "true");
    expect(desktopLogo).toHaveClass("hidden", "sm:block");
  });
});
