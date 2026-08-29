import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { handleListMarketplace, type PublicTrendingProduct } from "./catalog.functions";

describe("handleListMarketplace", () => {
  it("returns seller metadata from the trending RPC without another seller request", async () => {
    const product: PublicTrendingProduct = {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Cotton shirt",
      cover_image_url: "https://example.test/shirt.webp",
      price: 12.5,
      currency: "EUR",
      moq: 5,
      pack_size: "5 pieces",
      stock: "in_stock",
      seller_id: "00000000-0000-4000-8000-000000000010",
      created_at: "2026-08-29T12:00:00.000Z",
      seller_name: "Atelier One",
      seller_slug: "atelier-one",
    };
    const featuredSeller = {
      id: "00000000-0000-4000-8000-000000000020",
      slug: "featured-seller",
      name: "Featured Seller",
      city: "Berlin",
      country: "Germany",
      verified: true,
      cover_image_url: "https://example.test/cover.webp",
      logo_url: "https://example.test/logo.webp",
      primary_category_id: "00000000-0000-4000-8000-000000000030",
    };
    const rpc = vi.fn(async (name: string) => {
      if (name === "list_public_trending_products") {
        return { data: [product], error: null };
      }
      if (name === "list_public_featured_sellers") {
        return { data: [featuredSeller], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    const result = await handleListMarketplace({ audience: "women" }, {
      createPublicClient: () => ({ rpc }),
    } as never);

    expect(result).toEqual({ trending: [product], sellers: [featuredSeller] });
    expect(result.trending[0]).toMatchObject({
      seller_name: "Atelier One",
      seller_slug: "atelier-one",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "list_public_trending_products", {
      p_audience: "women",
      p_limit: 8,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "list_public_featured_sellers", {
      p_audience: "women",
      p_limit: 6,
    });
  });

  it("requires seller identity in the exported trending-product contract", () => {
    expectTypeOf<PublicTrendingProduct["seller_name"]>().toEqualTypeOf<string>();
    expectTypeOf<PublicTrendingProduct["seller_slug"]>().toEqualTypeOf<string>();
  });
});
