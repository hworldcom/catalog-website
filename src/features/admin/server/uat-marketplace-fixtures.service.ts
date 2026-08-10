import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import {
  fixtureAssetFiles,
  fixtureSellerSlugs,
  UAT_MARKETPLACE_SELLERS,
  type UatMarketplaceProductFixture,
  type UatMarketplaceSellerFixture,
} from "./uat-marketplace-fixtures.manifest";

const MAXIMUM_ASSET_SIZE_BYTES = 20 * 1024 * 1024;

export type UatMarketplaceFixtureAsset = {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  relativePath: string;
};

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

type AssetLoader = (relativePath: string) => Promise<UatMarketplaceFixtureAsset>;

export class UatMarketplaceFixtureService {
  constructor(
    private readonly gateway: UatMarketplaceFixtureGateway,
    private readonly assetDirectory: string,
    private readonly preservedAdministratorUserIds: string[],
    private readonly password: string,
    private readonly loadAsset: AssetLoader = loadFixtureAsset,
  ) {}

  async reset(): Promise<UatMarketplaceFixtureSummary> {
    return {
      mode: "reset",
      reset: await this.gateway.reset(this.preservedAdministratorUserIds),
      verification: null,
    };
  }

  async seed(): Promise<UatMarketplaceFixtureSummary> {
    const assets = await this.preflightAssets();
    const existingSellerSlugs = await this.gateway.listSellerSlugs();
    const expectedSellerSlugs = new Set(fixtureSellerSlugs());
    const reset = existingSellerSlugs.some((slug) => !expectedSellerSlugs.has(slug))
      ? await this.gateway.reset(this.preservedAdministratorUserIds)
      : null;

    for (const seller of UAT_MARKETPLACE_SELLERS) {
      const ensured = await this.gateway.ensureSeller({
        fixture: seller,
        password: this.password,
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

    return { mode: "seed", reset, verification: await this.gateway.verify() };
  }

  async verify(): Promise<UatMarketplaceFixtureSummary> {
    return { mode: "verify", reset: null, verification: await this.gateway.verify() };
  }

  private async preflightAssets(): Promise<Map<string, UatMarketplaceFixtureAsset>> {
    const entries = await Promise.all(
      fixtureAssetFiles().map(async (relativePath) => {
        const absolutePath = safeAssetPath(this.assetDirectory, relativePath);
        return [relativePath, await this.loadAsset(absolutePath)] as const;
      }),
    );
    return new Map(entries);
  }
}

export async function loadFixtureAsset(absolutePath: string): Promise<UatMarketplaceFixtureAsset> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(absolutePath));
  } catch {
    throw new Error(`uat_marketplace_fixture_asset_missing:${absolutePath}`);
  }
  if (
    bytes.byteLength < 3 ||
    bytes.byteLength > MAXIMUM_ASSET_SIZE_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    throw new Error(`uat_marketplace_fixture_asset_invalid:${absolutePath}`);
  }
  return { relativePath: absolutePath, bytes, contentType: "image/jpeg" };
}

function safeAssetPath(assetDirectory: string, relativePath: string): string {
  const root = resolve(assetDirectory);
  const absolutePath = resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${sep}`)) {
    throw new Error("uat_marketplace_fixture_asset_path_invalid");
  }
  return absolutePath;
}

function requireAsset(
  assets: Map<string, UatMarketplaceFixtureAsset>,
  relativePath: string,
): UatMarketplaceFixtureAsset {
  const asset = assets.get(relativePath);
  if (!asset) throw new Error(`uat_marketplace_fixture_asset_missing:${relativePath}`);
  return asset;
}
