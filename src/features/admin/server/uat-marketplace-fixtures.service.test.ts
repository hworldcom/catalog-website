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

const assets = new Map(
  fixtureAssetFiles().map((path) => [
    path,
    {
      relativePath: path,
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      contentType: "image/jpeg",
    } satisfies UatMarketplaceFixtureAsset,
  ]),
);

const seedInput = {
  assetDirectory: "/assets",
  password: "fixture-password",
};

describe("UatMarketplaceFixtureService", () => {
  it("preflights the complete bundle before refusing a non-fixture catalog", async () => {
    const events: string[] = [];
    const fake = gateway({
      listSellerSlugs: vi.fn(async () => {
        events.push("list");
        return ["old-seller"];
      }),
    });
    const load = vi.fn(async () => {
      events.push("assets");
      return assets;
    });

    await expect(new UatMarketplaceFixtureService(fake, load).seed(seedInput)).rejects.toThrow(
      "uat_marketplace_fixture_conflict",
    );

    expect(events).toEqual(["assets", "list"]);
    expect(load).toHaveBeenCalledWith("/assets");
    expect(fake.reset).not.toHaveBeenCalled();
    expect(fake.ensureSeller).not.toHaveBeenCalled();
    expect(fake.ensureProduct).not.toHaveBeenCalled();
  });

  it("does not reset an existing fixture-only catalog", async () => {
    const fake = gateway({
      listSellerSlugs: vi.fn().mockResolvedValue(fixtureSellerSlugs()),
    });
    await new UatMarketplaceFixtureService(fake, vi.fn().mockResolvedValue(assets)).seed(seedInput);
    expect(fake.reset).not.toHaveBeenCalled();
  });

  it("does not call any gateway method when bundle preflight fails", async () => {
    const fake = gateway({ listSellerSlugs: vi.fn().mockResolvedValue(["old-seller"]) });
    const service = new UatMarketplaceFixtureService(
      fake,
      vi.fn().mockRejectedValue(new Error("uat_marketplace_fixture_asset_missing")),
    );
    await expect(service.seed(seedInput)).rejects.toThrow("uat_marketplace_fixture_asset_missing");
    expect(fake.listSellerSlugs).not.toHaveBeenCalled();
    expect(fake.reset).not.toHaveBeenCalled();
    expect(fake.ensureSeller).not.toHaveBeenCalled();
    expect(fake.ensureProduct).not.toHaveBeenCalled();
    expect(fake.verify).not.toHaveBeenCalled();
  });

  it("passes the preserved administrator only to reset", async () => {
    const fake = gateway();
    const service = new UatMarketplaceFixtureService(fake);
    const preservedAdministratorUserIds = ["00000000-0000-4000-8000-000000000001"];
    await service.reset(preservedAdministratorUserIds);
    expect(fake.reset).toHaveBeenCalledWith(preservedAdministratorUserIds);
    expect(fake.listSellerSlugs).not.toHaveBeenCalled();
  });
});
