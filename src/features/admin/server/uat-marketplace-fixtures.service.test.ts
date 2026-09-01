import { describe, expect, it, vi } from "vitest";

import { fixtureAssetFiles, fixtureSellerSlugs } from "./uat-marketplace-fixtures.manifest";
import {
  UatMarketplaceFixtureService,
  type UatMarketplaceFixtureAsset,
  type UatMarketplaceFixtureGateway,
} from "./uat-marketplace-fixtures.service";

function gateway(overrides: Partial<UatMarketplaceFixtureGateway> = {}) {
  return {
    planReset: vi.fn().mockResolvedValue({
      authUserIds: [],
      databaseRows: 0,
      preservedAdministratorUserIds: [],
      storageObjectKeys: {},
    }),
    reset: vi.fn().mockResolvedValue({
      deletedAuthUsers: 0,
      deletedDatabaseRows: 0,
      deletedStorageObjects: 0,
      plannedAuthUsers: 0,
      plannedDatabaseRows: 0,
      plannedStorageObjects: 0,
    }),
    preflightSeed: vi.fn().mockResolvedValue(undefined),
    ensureSeller: vi.fn().mockResolvedValue({
      sellerId: crypto.randomUUID(),
      sellerUserId: crypto.randomUUID(),
    }),
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
      preflightSeed: vi.fn(async () => {
        events.push("gateway");
        throw new Error("uat_marketplace_fixture_conflict");
      }),
    });
    const load = vi.fn(async () => {
      events.push("assets");
      return assets;
    });

    await expect(new UatMarketplaceFixtureService(fake, load).seed(seedInput)).rejects.toThrow(
      "uat_marketplace_fixture_conflict",
    );

    expect(events).toEqual(["assets", "gateway"]);
    expect(load).toHaveBeenCalledWith("/assets");
    expect(fake.reset).not.toHaveBeenCalled();
    expect(fake.ensureSeller).not.toHaveBeenCalled();
    expect(fake.ensureProduct).not.toHaveBeenCalled();
  });

  it("does not reset an existing fixture-only catalog", async () => {
    const fake = gateway();
    await new UatMarketplaceFixtureService(fake, vi.fn().mockResolvedValue(assets)).seed(seedInput);
    expect(fake.reset).not.toHaveBeenCalled();
    expect(fake.verify).toHaveBeenCalledWith(assets);
  });

  it("loads the fixture bundle for standalone verification", async () => {
    const fake = gateway();
    const load = vi.fn().mockResolvedValue(assets);

    await new UatMarketplaceFixtureService(fake, load).verify("/assets");

    expect(load).toHaveBeenCalledWith("/assets");
    expect(fake.verify).toHaveBeenCalledWith(assets);
  });

  it("does not call any gateway method when bundle preflight fails", async () => {
    const fake = gateway();
    const service = new UatMarketplaceFixtureService(
      fake,
      vi.fn().mockRejectedValue(new Error("uat_marketplace_fixture_asset_missing")),
    );
    await expect(service.seed(seedInput)).rejects.toThrow("uat_marketplace_fixture_asset_missing");
    expect(fake.preflightSeed).not.toHaveBeenCalled();
    expect(fake.reset).not.toHaveBeenCalled();
    expect(fake.ensureSeller).not.toHaveBeenCalled();
    expect(fake.ensureProduct).not.toHaveBeenCalled();
    expect(fake.verify).not.toHaveBeenCalled();
  });

  it("logs the reset plan before deleting while preserving the administrator allowlist", async () => {
    const events: string[] = [];
    const preservedAdministratorUserIds = ["00000000-0000-4000-8000-000000000001"];
    const plan = {
      authUserIds: ["00000000-0000-4000-8000-000000000002"],
      databaseRows: 42,
      preservedAdministratorUserIds,
      storageObjectKeys: {
        "product-images": ["one.jpg"],
        "product-draft-images": ["two.jpg"],
      },
    };
    const fake = gateway({
      planReset: vi.fn(async () => {
        events.push("plan");
        return plan;
      }),
      reset: vi.fn(async () => {
        events.push("reset");
        return {
          deletedAuthUsers: 1,
          deletedDatabaseRows: 42,
          deletedStorageObjects: 2,
          plannedAuthUsers: 1,
          plannedDatabaseRows: 42,
          plannedStorageObjects: 2,
        };
      }),
    });
    const log = vi.fn((entry: Record<string, unknown>) => {
      events.push(`log:${entry.event}`);
    });
    const service = new UatMarketplaceFixtureService(fake, undefined, log);

    await service.reset(preservedAdministratorUserIds);

    expect(events).toEqual([
      "plan",
      "log:uat_marketplace_fixture_reset_planned",
      "reset",
      "log:uat_marketplace_fixture_reset_completed",
    ]);
    expect(fake.planReset).toHaveBeenCalledWith(preservedAdministratorUserIds);
    expect(fake.reset).toHaveBeenCalledWith(plan);
    expect(log).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        plannedAuthUsers: 1,
        plannedDatabaseRows: 42,
        plannedStorageObjects: 2,
        preservedAdministratorUserIds,
      }),
    );
    expect(fake.preflightSeed).not.toHaveBeenCalled();
  });
});
