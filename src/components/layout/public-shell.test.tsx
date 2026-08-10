import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
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
      getUser: () => new Promise(() => undefined),
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
});
