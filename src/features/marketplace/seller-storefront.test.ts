import { describe, expect, it } from "vitest";

import type { StorefrontProduct } from "./seller-storefront";
import {
  buildWhatsAppUrl,
  filterStorefrontProducts,
  getSellerInitial,
  getYearsInBusiness,
  groupStorefrontProducts,
  normalizeWhatsAppNumber,
} from "./seller-storefront";

function product(
  id: string,
  category: StorefrontProduct["category"],
  coverImageUrl: string | null = null,
): StorefrontProduct {
  return {
    id,
    title: `Product ${id}`,
    cover_image_url: coverImageUrl,
    price: null,
    currency: "USD",
    moq: null,
    pack_size: null,
    stock: "in_stock",
    category_id: category?.id ?? null,
    category,
  };
}

describe("groupStorefrontProducts", () => {
  const cotton = { id: "cat-cotton", slug: "cotton", name: "Cotton" };
  const linen = { id: "cat-linen", slug: "linen", name: "Linen" };

  it("groups real categorized products and sorts categories by name", () => {
    const groups = groupStorefrontProducts([
      product("linen-1", linen, "/linen.jpg"),
      product("cotton-1", cotton, null),
      product("cotton-2", cotton, "/cotton.jpg"),
      product("uncategorized", null, "/other.jpg"),
    ]);

    expect(groups.map((group) => group.category.name)).toEqual(["Cotton", "Linen"]);
    expect(groups[0]?.products.map((item) => item.id)).toEqual(["cotton-1", "cotton-2"]);
  });

  it("uses the first available product image in each category", () => {
    const [group] = groupStorefrontProducts([
      product("cotton-1", cotton, null),
      product("cotton-2", cotton, "/cotton.jpg"),
      product("cotton-3", cotton, "/later.jpg"),
    ]);

    expect(group?.imageUrl).toBe("/cotton.jpg");
  });
});

describe("filterStorefrontProducts", () => {
  const cotton = { id: "cat-cotton", slug: "cotton", name: "Cotton" };
  const products = [product("cotton-1", cotton), product("other", null)];

  it("returns all products when no category is selected", () => {
    expect(filterStorefrontProducts(products, null)).toEqual(products);
  });

  it("returns only products from the selected category", () => {
    expect(filterStorefrontProducts(products, cotton.id).map((item) => item.id)).toEqual([
      "cotton-1",
    ]);
  });
});

describe("storefront fallbacks", () => {
  it("derives years in business only from valid non-future years", () => {
    expect(getYearsInBusiness(1998, 2026)).toBe(28);
    expect(getYearsInBusiness(2027, 2026)).toBeNull();
    expect(getYearsInBusiness(null, 2026)).toBeNull();
  });

  it("derives a normalized seller initial", () => {
    expect(getSellerInitial("  kesar Textiles")).toBe("K");
    expect(getSellerInitial("")).toBe("B");
  });

  it("normalizes WhatsApp numbers and safely encodes messages", () => {
    expect(normalizeWhatsAppNumber("+49 (30) 123-45")).toBe("493012345");
    expect(normalizeWhatsAppNumber("not available")).toBeNull();
    expect(buildWhatsAppUrl("+49 30 123", "Hello & welcome")).toBe(
      "https://wa.me/4930123?text=Hello%20%26%20welcome",
    );
  });
});
