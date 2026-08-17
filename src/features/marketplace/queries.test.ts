import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAudienceNavigation: vi.fn(),
  getCategoryPage: vi.fn(),
  getProductPage: vi.fn(),
  getSellerPage: vi.fn(),
  listMarketplace: vi.fn(),
}));

vi.mock("./catalog.functions", () => ({
  getAudienceNavigation: mocks.getAudienceNavigation,
  getCategoryPage: mocks.getCategoryPage,
  getHomePage: vi.fn(),
  getProductPage: mocks.getProductPage,
  getSellerPage: mocks.getSellerPage,
  listMarketplace: mocks.listMarketplace,
}));

import {
  audienceNavigationQueryOptions,
  categoryQueryOptions,
  marketplaceQueryOptions,
  productQueryOptions,
  sellerQueryOptions,
} from "./queries";

describe("audience-aware marketplace query options", () => {
  it("uses audience in homepage cache keys and requests", async () => {
    mocks.listMarketplace.mockResolvedValue({ trending: [], sellers: [] });
    const options = marketplaceQueryOptions("all");

    expect(options.queryKey).toEqual(["marketplace", "home", "all"]);
    await options.queryFn?.({} as never);
    expect(mocks.listMarketplace).toHaveBeenCalledWith({ data: { audience: "all" } });
  });

  it("uses audience in navigation cache keys and requests", async () => {
    mocks.getAudienceNavigation.mockResolvedValue({ categories: [], sellers: [] });
    const options = audienceNavigationQueryOptions("kids");

    expect(options.queryKey).toEqual(["marketplace", "navigation", "kids"]);
    await options.queryFn?.({} as never);
    expect(mocks.getAudienceNavigation).toHaveBeenCalledWith({ data: { audience: "kids" } });
  });

  it("uses audience in category cache keys and requests", async () => {
    mocks.getCategoryPage.mockResolvedValue({ category: null, products: [], sellers: [] });
    const options = categoryQueryOptions("trousers", "men");

    expect(options.queryKey).toEqual(["category", "trousers", "men"]);
    await options.queryFn?.({} as never);
    expect(mocks.getCategoryPage).toHaveBeenCalledWith({
      data: { slug: "trousers", audience: "men" },
    });
  });

  it("uses audience in seller cache keys and requests", async () => {
    mocks.getSellerPage.mockResolvedValue({ seller: null, products: [] });
    const options = sellerQueryOptions("seller", "women");

    expect(options.queryKey).toEqual(["seller", "seller", "women"]);
    await options.queryFn?.({} as never);
    expect(mocks.getSellerPage).toHaveBeenCalledWith({
      data: { slug: "seller", audience: "women" },
    });
  });
});

describe("productQueryOptions", () => {
  it("uses language and audience in the cache key and request", async () => {
    mocks.getProductPage.mockResolvedValue({ product: null });
    const options = productQueryOptions("00000000-0000-4000-8000-000000000001", "DE", "kids");

    expect(options.queryKey).toEqual([
      "product",
      "00000000-0000-4000-8000-000000000001",
      "DE",
      "kids",
    ]);

    await options.queryFn?.({} as never);

    expect(mocks.getProductPage).toHaveBeenCalledWith({
      data: {
        id: "00000000-0000-4000-8000-000000000001",
        language: "DE",
        audience: "kids",
      },
    });
  });
});
