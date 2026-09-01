import {
  UAT_MARKETPLACE_SELLERS,
  type UatMarketplaceProductFixture,
  type UatMarketplaceSellerFixture,
} from "./uat-marketplace-fixtures.manifest";
import {
  loadUatMarketplaceFixtureAssetBundle,
  type UatMarketplaceFixtureAsset,
} from "./uat-marketplace-fixtures.assets";

export type { UatMarketplaceFixtureAsset } from "./uat-marketplace-fixtures.assets";

export type UatMarketplaceFixtureVerification = {
  productCodes: string[];
  productCount: number;
  publicImageCount: number;
  sellerCount: number;
  sellerSlugs: string[];
};

export type UatMarketplaceFixtureResetSummary = {
  deletedAuthUsers: number;
  deletedDatabaseRows: number;
  deletedStorageObjects: number;
  plannedAuthUsers: number;
  plannedDatabaseRows: number;
  plannedStorageObjects: number;
};

export type UatMarketplaceFixtureResetPlan = {
  authUserIds: string[];
  databaseRows: number;
  preservedAdministratorUserIds: string[];
  storageObjectKeys: Record<string, string[]>;
};

export interface UatMarketplaceFixtureGateway {
  planReset(preservedAdministratorUserIds: string[]): Promise<UatMarketplaceFixtureResetPlan>;
  reset(plan: UatMarketplaceFixtureResetPlan): Promise<UatMarketplaceFixtureResetSummary>;
  preflightSeed(assets: Map<string, UatMarketplaceFixtureAsset>): Promise<void>;
  ensureSeller(input: {
    cover: UatMarketplaceFixtureAsset;
    fixture: UatMarketplaceSellerFixture;
    logo: UatMarketplaceFixtureAsset;
    password: string;
  }): Promise<{ sellerId: string; sellerUserId: string }>;
  ensureProduct(input: {
    assets: UatMarketplaceFixtureAsset[];
    audience: UatMarketplaceSellerFixture["audience"];
    fixture: UatMarketplaceProductFixture;
    sellerId: string;
    sellerSlug: string;
    sellerUserId: string;
  }): Promise<void>;
  verify(
    assets: Map<string, UatMarketplaceFixtureAsset>,
  ): Promise<UatMarketplaceFixtureVerification>;
}

export type UatMarketplaceFixtureSummary = {
  mode: "reset" | "seed" | "verify";
  reset: UatMarketplaceFixtureResetSummary | null;
  verification: UatMarketplaceFixtureVerification | null;
};

type AssetBundleLoader = (
  assetDirectory: string,
) => Promise<Map<string, UatMarketplaceFixtureAsset>>;

type SeedInput = {
  assetDirectory: string;
  password: string;
};

type FixtureLog = (entry: Record<string, unknown>) => void;

export class UatMarketplaceFixtureService {
  constructor(
    private readonly gateway: UatMarketplaceFixtureGateway,
    private readonly loadAssets: AssetBundleLoader = loadUatMarketplaceFixtureAssetBundle,
    private readonly log: FixtureLog = writeFixtureLog,
  ) {}

  async reset(preservedAdministratorUserIds: string[]): Promise<UatMarketplaceFixtureSummary> {
    const plan = await this.gateway.planReset(preservedAdministratorUserIds);
    const plannedStorageObjects = Object.values(plan.storageObjectKeys).reduce(
      (total, keys) => total + keys.length,
      0,
    );
    this.log({
      event: "uat_marketplace_fixture_reset_planned",
      mode: "reset",
      preservedAdministratorUserIds: plan.preservedAdministratorUserIds,
      plannedAuthUsers: plan.authUserIds.length,
      plannedDatabaseRows: plan.databaseRows,
      plannedStorageObjects,
    });
    const reset = await this.gateway.reset(plan);
    this.log({ event: "uat_marketplace_fixture_reset_completed", mode: "reset", ...reset });
    return {
      mode: "reset",
      reset,
      verification: null,
    };
  }

  async seed(input: SeedInput): Promise<UatMarketplaceFixtureSummary> {
    const assets = await this.loadAssets(input.assetDirectory);
    await this.gateway.preflightSeed(assets);

    for (const seller of UAT_MARKETPLACE_SELLERS) {
      const ensured = await this.gateway.ensureSeller({
        fixture: seller,
        password: input.password,
        logo: requireAsset(assets, seller.logoFile),
        cover: requireAsset(assets, seller.coverFile),
      });
      for (const product of seller.products) {
        await this.gateway.ensureProduct({
          sellerId: ensured.sellerId,
          sellerUserId: ensured.sellerUserId,
          sellerSlug: seller.slug,
          audience: seller.audience,
          fixture: product,
          assets: product.imageFiles.map((path) => requireAsset(assets, path)),
        });
      }
    }

    return { mode: "seed", reset: null, verification: await this.gateway.verify(assets) };
  }

  async verify(assetDirectory: string): Promise<UatMarketplaceFixtureSummary> {
    const assets = await this.loadAssets(assetDirectory);
    return { mode: "verify", reset: null, verification: await this.gateway.verify(assets) };
  }
}

function writeFixtureLog(entry: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "bazoria_uat_marketplace_fixtures",
      severity: "info",
      ...entry,
    }),
  );
}

function requireAsset(
  assets: Map<string, UatMarketplaceFixtureAsset>,
  relativePath: string,
): UatMarketplaceFixtureAsset {
  const asset = assets.get(relativePath);
  if (!asset) throw new Error("uat_marketplace_fixture_asset_missing");
  return asset;
}
