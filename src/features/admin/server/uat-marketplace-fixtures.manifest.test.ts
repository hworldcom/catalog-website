import { describe, expect, it } from "vitest";

import {
  fixtureAssetFiles,
  fixtureSellerSlugs,
  UAT_MARKETPLACE_SELLERS,
} from "./uat-marketplace-fixtures.manifest";

describe("UAT marketplace fixture manifest", () => {
  it("contains four sellers, sixteen products, and four two-image galleries", () => {
    const products = UAT_MARKETPLACE_SELLERS.flatMap((seller) => seller.products);
    expect(UAT_MARKETPLACE_SELLERS).toHaveLength(4);
    expect(products).toHaveLength(16);
    expect(products.filter((product) => product.imageFiles.length === 2)).toHaveLength(4);
    expect(products.every((product) => product.imageFiles.length >= 1)).toBe(true);
  });

  it("keeps stable unique identities and leaves the requested categories empty", () => {
    const products = UAT_MARKETPLACE_SELLERS.flatMap((seller) => seller.products);
    expect(new Set(fixtureSellerSlugs()).size).toBe(4);
    expect(new Set(UAT_MARKETPLACE_SELLERS.map((seller) => seller.email)).size).toBe(4);
    expect(new Set(UAT_MARKETPLACE_SELLERS.map((seller) => seller.companyCode)).size).toBe(4);
    expect(new Set(fixtureAssetFiles()).size).toBe(fixtureAssetFiles().length);
    expect(products.map((product) => product.categorySlug)).not.toContain("sportswear");
    expect(products.map((product) => product.categorySlug)).not.toContain("sweatshirts");
  });
});
