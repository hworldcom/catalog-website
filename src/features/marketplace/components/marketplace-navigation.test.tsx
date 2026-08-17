import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  data: {
    audience: "women",
    categories: [
      { id: "category-1", slug: "t-shirts", name: "Canonical shirts", sortOrder: 10 },
      { id: "category-2", slug: "trousers", name: "Canonical trousers", sortOrder: 20 },
    ],
    sellers: [
      {
        id: "seller-1",
        slug: "kesar-textiles",
        name: "Kesar Textiles",
        logoUrl: "https://example.test/kesar.png",
      },
      {
        id: "seller-2",
        slug: "alpha-supply",
        name: "Alpha Supply",
        logoUrl: null,
      },
    ],
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: () => ({ data: mocks.data }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({
    children,
    to,
    params,
    search,
    ...props
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
    search?: (previous: Record<string, unknown>) => Record<string, unknown>;
    [key: string]: unknown;
  }) => {
    const href = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to,
    );
    const resolvedSearch = search?.({ lang: "DE", audience: "women" });
    return (
      <a
        {...props}
        href={href}
        data-route-search={resolvedSearch ? JSON.stringify(resolvedSearch) : undefined}
      >
        {children}
      </a>
    );
  },
}));

vi.mock("@/lib/i18n", () => ({
  t: (EN: string, PL: string, DE: string, VI: string) => ({ EN, PL, DE, VI }),
  tr: (value: { EN: string }) => value.EN,
  pick: (value: { EN: string }) => value.EN,
  useLang: () => "EN",
}));

vi.mock("../queries", () => ({
  audienceNavigationQueryOptions: (audience: string) => ({
    queryKey: ["marketplace", "navigation", audience],
  }),
}));

import { MarketplaceNavigation } from "./marketplace-navigation";

describe("MarketplaceNavigation", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.data.categories = [
      { id: "category-1", slug: "t-shirts", name: "Canonical shirts", sortOrder: 10 },
      { id: "category-2", slug: "trousers", name: "Canonical trousers", sortOrder: 20 },
    ];
    mocks.data.sellers = [
      {
        id: "seller-1",
        slug: "kesar-textiles",
        name: "Kesar Textiles",
        logoUrl: "https://example.test/kesar.png",
      },
      {
        id: "seller-2",
        slug: "alpha-supply",
        name: "Alpha Supply",
        logoUrl: null,
      },
    ];
  });

  it("opens panels by pointer hover and keeps them open while the pointer enters the panel", () => {
    render(<MarketplaceNavigation audience="women" />);
    const navigation = screen.getByRole("navigation", { name: "Marketplace navigation" });
    const clothing = screen.getByRole("button", { name: "Clothing" });

    fireEvent.pointerEnter(clothing, { pointerType: "mouse" });
    const panel = screen.getByRole("region", { name: "Clothing" });
    expect(clothing).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByRole("link", { name: "T-shirts" })).toBeVisible();

    fireEvent.pointerEnter(panel, { pointerType: "mouse" });
    expect(panel).toBeVisible();

    fireEvent.pointerLeave(navigation, { pointerType: "mouse" });
    expect(screen.queryByRole("region", { name: "Clothing" })).not.toBeInTheDocument();
  });

  it("places All first and the primary marketplace sections below the audience row", () => {
    render(<MarketplaceNavigation audience="women" />);

    const audienceRow = screen.getByTestId("marketplace-audience-row");
    const sectionRow = screen.getByTestId("marketplace-section-row");
    const kids = within(audienceRow).getByRole("button", { name: "Kids" });
    const joinUs = within(audienceRow).getByRole("link", { name: "Join Us" });
    const all = within(audienceRow).getByRole("button", { name: "All" });
    const women = within(audienceRow).getByRole("button", { name: "Women" });

    expect(audienceRow.nextElementSibling).toBe(sectionRow);
    expect(audienceRow).toHaveClass("border-b", "border-border/60", "bg-secondary/30");
    expect(sectionRow).toHaveClass("lg:justify-start");
    expect(sectionRow).not.toHaveClass("bg-secondary/30");
    expect(all.nextElementSibling).toBe(women);
    expect(within(sectionRow).getByRole("button", { name: "Clothing" })).toBeVisible();
    expect(within(sectionRow).getByRole("button", { name: "Sellers" })).toBeVisible();
    expect(kids.nextElementSibling).toBe(joinUs);
    expect(joinUs).toHaveClass("ml-auto", "min-h-11", "shrink-0");
    expect(within(sectionRow).queryByRole("link", { name: "Join Us" })).not.toBeInTheDocument();
  });

  it("marks All as the selected virtual audience", () => {
    render(<MarketplaceNavigation audience="all" />);

    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Women" })).toHaveAttribute("aria-pressed", "false");
  });

  it("closes an open disclosure when focus moves to the Join Us link", () => {
    render(<MarketplaceNavigation audience="women" />);

    fireEvent.focus(screen.getByRole("button", { name: "Clothing" }));
    expect(screen.getByRole("region", { name: "Clothing" })).toBeVisible();

    fireEvent.focus(screen.getByRole("link", { name: "Join Us" }));
    expect(screen.queryByRole("region", { name: "Clothing" })).not.toBeInTheDocument();
  });

  it("opens on keyboard focus and Escape closes the panel and restores trigger focus", () => {
    render(<MarketplaceNavigation audience="women" />);
    const sellers = screen.getByRole("button", { name: "Sellers" });

    fireEvent.focus(sellers);
    expect(screen.getByRole("region", { name: "Sellers" })).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Sellers" })).not.toBeInTheDocument();
    expect(sellers).toHaveFocus();
  });

  it("switches panels on click and closes the current panel on an outside press", async () => {
    const user = userEvent.setup();
    render(<MarketplaceNavigation audience="women" />);
    const clothing = screen.getByRole("button", { name: "Clothing" });
    const sellers = screen.getByRole("button", { name: "Sellers" });

    await user.click(clothing);
    expect(screen.getByRole("region", { name: "Clothing" })).toBeVisible();

    await user.click(sellers);
    expect(screen.queryByRole("region", { name: "Clothing" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sellers" })).toBeVisible();

    fireEvent.pointerDown(document.body, { pointerType: "mouse" });
    expect(screen.queryByRole("region", { name: "Sellers" })).not.toBeInTheDocument();
  });

  it("uses touch controls as a disclosure that can open and close", () => {
    render(<MarketplaceNavigation audience="women" />);
    const clothing = screen.getByRole("button", { name: "Clothing" });

    fireEvent.pointerDown(clothing, { pointerType: "touch" });
    fireEvent.click(clothing);
    expect(clothing).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(clothing, { pointerType: "touch" });
    fireEvent.click(clothing);
    expect(clothing).toHaveAttribute("aria-expanded", "false");
    expect(clothing).toHaveClass("min-h-11");
  });

  it("falls back to stable seller initials when a logo is missing or fails", async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketplaceNavigation audience="women" />);

    await user.click(screen.getByRole("button", { name: "Sellers" }));
    const alphaLink = screen.getByRole("link", { name: "Alpha Supply" });
    expect(within(alphaLink).getByText("A")).toBeVisible();

    const kesarLink = screen.getByRole("link", { name: "Kesar Textiles" });
    const logo = container.querySelector('img[src="https://example.test/kesar.png"]');
    expect(logo).not.toBeNull();
    fireEvent.error(logo!);
    expect(within(kesarLink).getByText("K")).toBeVisible();
  });

  it("keeps the current route and language when the audience changes", async () => {
    const user = userEvent.setup();
    render(<MarketplaceNavigation audience="women" />);

    await user.click(screen.getByRole("button", { name: "Men" }));
    expect(mocks.navigate).toHaveBeenCalledOnce();
    const request = mocks.navigate.mock.calls[0]?.[0] as {
      to: string;
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(request.to).toBe(".");
    expect(request.search({ lang: "DE", audience: "women" })).toEqual({
      lang: "DE",
      audience: "men",
    });
  });

  it("preserves language and audience in category and seller links", async () => {
    const user = userEvent.setup();
    render(<MarketplaceNavigation audience="kids" />);

    await user.click(screen.getByRole("button", { name: "Clothing" }));
    expect(screen.getByRole("link", { name: "T-shirts" })).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "kids" }),
    );

    await user.click(screen.getByRole("button", { name: "Sellers" }));
    expect(screen.getByRole("link", { name: "Kesar Textiles" })).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "kids" }),
    );
    expect(screen.getByRole("link", { name: "Join Us" })).toHaveAttribute(
      "data-route-search",
      JSON.stringify({ lang: "DE", audience: "kids" }),
    );
  });

  it("renders localized successful empty states", async () => {
    const user = userEvent.setup();
    mocks.data.categories = [];
    mocks.data.sellers = [];
    render(<MarketplaceNavigation audience="women" />);

    await user.click(screen.getByRole("button", { name: "Clothing" }));
    expect(
      screen.getByText("No clothing categories are available for this audience yet."),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Sellers" }));
    expect(screen.getByText("No sellers are available for this audience yet.")).toBeVisible();
  });
});
