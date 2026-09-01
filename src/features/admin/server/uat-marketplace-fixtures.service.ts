import {
  fixtureSellerSlugs,
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
  deletedDatabaseSellers: number;
  deletedPrivateObjects: number;
  deletedPublicObjects: number;
};

export interface UatMarketplaceFixtureGateway {
  listSellerSlugs(): Promise<string[]>;
  reset(preservedAdministratorUserIds: string[]): Promise<UatMarketplaceFixtureResetSummary>;
  ensureSeller(input: {
    cover: UatMarketplaceFixtureAsset;
    fixture: UatMarketplaceSellerFixture;
    logo: UatMarketplaceFixtureAsset;
    password: string;
  }): Promise<{ sellerId: string }>;
  ensureProduct(input: {
    assets: UatMarketplaceFixtureAsset[];
    audience: UatMarketplaceSellerFixture["audience"];
    fixture: UatMarketplaceProductFixture;
    sellerId: string;
    sellerSlug: string;
  }): Promise<void>;
  verify(): Promise<UatMarketplaceFixtureVerification>;
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

export class UatMarketplaceFixtureService {
  constructor(
    private readonly gateway: UatMarketplaceFixtureGateway,
    private readonly loadAssets: AssetBundleLoader = loadUatMarketplaceFixtureAssetBundle,
  ) {}

  async reset(preservedAdministratorUserIds: string[]): Promise<UatMarketplaceFixtureSummary> {
    return {
      mode: "reset",
      reset: await this.gateway.reset(preservedAdministratorUserIds),
      verification: null,
    };
  }

  async seed(input: SeedInput): Promise<UatMarketplaceFixtureSummary> {
    const assets = await this.loadAssets(input.assetDirectory);
    const existingSellerSlugs = await this.gateway.listSellerSlugs();
    const expectedSellerSlugs = new Set(fixtureSellerSlugs());
    if (existingSellerSlugs.some((slug) => !expectedSellerSlugs.has(slug))) {
      throw new Error("uat_marketplace_fixture_conflict");
    }

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
          sellerSlug: seller.slug,
          audience: seller.audience,
          fixture: product,
          assets: product.imageFiles.map((path) => requireAsset(assets, path)),
        });
      }
    }

    return { mode: "seed", reset: null, verification: await this.gateway.verify() };
  }

  async verify(): Promise<UatMarketplaceFixtureSummary> {
    return { mode: "verify", reset: null, verification: await this.gateway.verify() };
  }
}

function requireAsset(
  assets: Map<string, UatMarketplaceFixtureAsset>,
  relativePath: string,
): UatMarketplaceFixtureAsset {
  const asset = assets.get(relativePath);
  if (!asset) throw new Error("uat_marketplace_fixture_asset_missing");
  return asset;
}
