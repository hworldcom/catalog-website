import { describe, expect, it, vi } from "vitest";

import { fixtureAssetFiles, fixtureSellerSlugs } from "./uat-marketplace-fixtures.manifest";
import {
  UatMarketplaceFixtureService,
  type UatMarketplaceFixtureAsset,
  type UatMarketplaceFixtureGateway,
} from "./uat-marketplace-fixtures.service";

function gateway(overrides: Partial<UatMarketplaceFixtureGateway> = {}) {
  return {
    listSellerSlugs: vi.fn().mockResolvedValue([]),
    reset: vi.fn().mockResolvedValue({
      deletedAuthUsers: 0,
      deletedDatabaseSellers: 0,
      deletedPrivateObjects: 0,
      deletedPublicObjects: 0,
    }),
    ensureSeller: vi.fn().mockResolvedValue({ sellerId: crypto.randomUUID() }),
    ensureProduct: vi.fn().mockResolvedValue(undefined),
    verify: vi.fn().mockResolvedValue({
      productCodes: Array.from({ length: 16 }, (_, index) => `CODE-${index}`),
      productCount: 16,
      publicImageCount: 20,
      sellerCount: 4,
      sellerSlugs: fixtureSellerSlugs(),
    }),
    ...overrides,
  } satisfies UatMarketplaceFixtureGateway;
}

const assetLoader = vi.fn(async (path: string): Promise<UatMarketplaceFixtureAsset> => ({
  relativePath: path,
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  contentType: "image/jpeg",
}));

describe("UatMarketplaceFixtureService", () => {
  it("preflights all assets before resetting a non-fixture catalog", async () => {
    const events: string[] = [];
    const fake = gateway({
      listSellerSlugs: vi.fn().mockResolvedValue(["old-seller"]),
      reset: vi.fn(async () => {
        events.push("reset");
        return {
          deletedAuthUsers: 1,
          deletedDatabaseSellers: 1,
          deletedPrivateObjects: 1,
          deletedPublicObjects: 1,
        };
      }),
    });
    const load = vi.fn(async (path: string) => {
      events.push(`asset:${path}`);
      return assetLoader(path);
    });

    const result = await new UatMarketplaceFixtureService(
      fake,
      "/assets",
      [],
      "password",
      load,
    ).seed();

    expect(load).toHaveBeenCalledTimes(fixtureAssetFiles().length);
    expect(events.indexOf("reset")).toBeGreaterThan(fixtureAssetFiles().length - 1);
    expect(fake.ensureSeller).toHaveBeenCalledTimes(4);
    expect(fake.ensureProduct).toHaveBeenCalledTimes(16);
    expect(result.verification?.publicImageCount).toBe(20);
  });

  it("does not reset an existing fixture-only catalog", async () => {
    const fake = gateway({
      listSellerSlugs: vi.fn().mockResolvedValue(fixtureSellerSlugs()),
    });
    await new UatMarketplaceFixtureService(fake, "/assets", [], "password", assetLoader).seed();
    expect(fake.reset).not.toHaveBeenCalled();
  });

  it("does not delete anything when asset preflight fails", async () => {
    const fake = gateway({ listSellerSlugs: vi.fn().mockResolvedValue(["old-seller"]) });
    const service = new UatMarketplaceFixtureService(
      fake,
      "/assets",
      [],
      "password",
      vi.fn().mockRejectedValue(new Error("asset missing")),
    );
    await expect(service.seed()).rejects.toThrow("asset missing");
    expect(fake.listSellerSlugs).not.toHaveBeenCalled();
    expect(fake.reset).not.toHaveBeenCalled();
  });
});
