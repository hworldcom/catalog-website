import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: { EN: string }) => value.EN,
}));

vi.mock("./marketplace-navigation", () => ({
  MarketplaceNavigation: () => <div data-testid="marketplace-navigation" />,
}));

vi.mock("./seller-brand", () => ({
  SellerBrand: ({ name }: { name: string }) => <div>{name}</div>,
}));

import { SellerStorefrontHeader } from "./seller-storefront-header";

describe("SellerStorefrontHeader", () => {
  it("uses the light card surface for storefront section navigation", () => {
    render(
      <SellerStorefrontHeader
        sellerName="Atelier One"
        logoUrl={null}
        whatsappUrl={null}
        showCategories
        showAbout
        audience="women"
      />,
    );

    const header = screen.getByRole("banner");
    expect(header).toHaveClass("bg-card/95");
    expect(header).not.toHaveClass("bg-background/95");
    expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute("href", "#categories");
    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute("href", "#catalog");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "#about");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "#contact");
  });
});
