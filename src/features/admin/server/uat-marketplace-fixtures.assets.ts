import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { z } from "zod";

import { fixtureAssetFiles, UAT_MARKETPLACE_SELLERS } from "./uat-marketplace-fixtures.manifest";

const MANIFEST_FILE = "manifest.json";
const MAXIMUM_ASSET_SIZE_BYTES = 20 * 1024 * 1024;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;
const SELLER_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const assetEntrySchema = z
  .object({
    sellerSlug: z.string().regex(SELLER_SLUG_PATTERN),
    productTitle: z.string().trim().min(1).nullable(),
    role: z.enum(["product_image", "seller_logo", "seller_storefront_cover"]),
    relativePath: z.string().trim().min(1),
    mediaType: z.literal("image/jpeg"),
    sizeBytes: z.number().int().positive().max(MAXIMUM_ASSET_SIZE_BYTES),
    sha256: z.string().regex(SHA_256_PATTERN),
  })
  .strict();

const assetManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    bundleVersion: z.literal("0038d-v1"),
    provenance: z
      .object({
        synthetic: z.literal(true),
        containsCustomerData: z.literal(false),
        containsThirdPartyBranding: z.literal(false),
      })
      .strict(),
    assets: z.array(assetEntrySchema).min(1),
  })
  .strict();

type AssetManifestEntry = z.infer<typeof assetEntrySchema>;

export type UatMarketplaceFixtureAsset = {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  relativePath: string;
};

export async function loadUatMarketplaceFixtureAssetBundle(
  assetDirectory: string,
): Promise<Map<string, UatMarketplaceFixtureAsset>> {
  const root = resolve(assetDirectory);
  await requireSafeDirectory(root);
  const manifest = await readManifest(root);
  validateManifestEntries(manifest.assets);

  const actualFiles = await listFiles(root);
  const actualFileSet = new Set(actualFiles);
  const declaredAssetPaths = manifest.assets.map((asset) => asset.relativePath);
  if (declaredAssetPaths.some((path) => !actualFileSet.has(path))) {
    throw new Error("uat_marketplace_fixture_asset_missing");
  }
  const expectedFiles = new Set([MANIFEST_FILE, ...declaredAssetPaths]);
  if (
    actualFiles.length !== expectedFiles.size ||
    actualFiles.some((path) => !expectedFiles.has(path))
  ) {
    throw new Error("uat_marketplace_fixture_asset_manifest_invalid");
  }

  const assets = await Promise.all(
    manifest.assets.map(
      async (entry) => [entry.relativePath, await readAsset(root, entry)] as const,
    ),
  );
  return new Map(assets);
}

async function requireSafeDirectory(path: string): Promise<void> {
  try {
    const details = await lstat(path);
    if (!details.isDirectory() || details.isSymbolicLink()) {
      throw new Error("uat_marketplace_fixture_asset_manifest_invalid");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "uat_marketplace_fixture_asset_manifest_invalid"
    ) {
      throw error;
    }
    throw new Error("uat_marketplace_fixture_asset_missing");
  }
}

async function readManifest(root: string) {
  try {
    const bytes = await readFile(resolve(root, MANIFEST_FILE), "utf8");
    return assetManifestSchema.parse(JSON.parse(bytes));
  } catch (error) {
    if (isMissingFileError(error)) throw new Error("uat_marketplace_fixture_asset_missing");
    throw new Error("uat_marketplace_fixture_asset_manifest_invalid");
  }
}

function validateManifestEntries(entries: AssetManifestEntry[]): void {
  const expectedIdentities = expectedAssetIdentities();
  const paths = new Set<string>();

  for (const entry of entries) {
    if (!isSafeRelativePath(entry.relativePath) || paths.has(entry.relativePath)) {
      throw new Error("uat_marketplace_fixture_asset_manifest_invalid");
    }
    paths.add(entry.relativePath);

    const expected = expectedIdentities.get(entry.relativePath);
    if (
      !expected ||
      expected.sellerSlug !== entry.sellerSlug ||
      expected.productTitle !== entry.productTitle ||
      expected.role !== entry.role
    ) {
      throw new Error("uat_marketplace_fixture_asset_manifest_invalid");
    }
  }

  const expectedPaths = fixtureAssetFiles();
  if (paths.size !== expectedPaths.length || expectedPaths.some((path) => !paths.has(path))) {
    throw new Error("uat_marketplace_fixture_asset_manifest_invalid");
  }
}

function expectedAssetIdentities(): Map<
  string,
  Pick<AssetManifestEntry, "productTitle" | "role" | "sellerSlug">
> {
  const entries = new Map<
    string,
    Pick<AssetManifestEntry, "productTitle" | "role" | "sellerSlug">
  >();
  for (const seller of UAT_MARKETPLACE_SELLERS) {
    entries.set(seller.logoFile, {
      sellerSlug: seller.slug,
      productTitle: null,
      role: "seller_logo",
    });
    entries.set(seller.coverFile, {
      sellerSlug: seller.slug,
      productTitle: null,
      role: "seller_storefront_cover",
    });
    for (const product of seller.products) {
      for (const path of product.imageFiles) {
        entries.set(path, {
          sellerSlug: seller.slug,
          productTitle: product.title,
          role: "product_image",
        });
      }
    }
  }
  return entries;
}

async function listFiles(root: string, directory = root): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new Error("uat_marketplace_fixture_asset_missing");
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
      throw new Error("uat_marketplace_fixture_asset_manifest_invalid");
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, absolutePath)));
      continue;
    }
    files.push(toPortableRelativePath(root, absolutePath));
  }
  return files.sort();
}

async function readAsset(
  root: string,
  entry: AssetManifestEntry,
): Promise<UatMarketplaceFixtureAsset> {
  const absolutePath = resolve(root, entry.relativePath);
  let details;
  let bytes: Uint8Array;
  try {
    details = await lstat(absolutePath);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new Error("uat_marketplace_fixture_asset_manifest_invalid");
    }
    bytes = new Uint8Array(await readFile(absolutePath));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "uat_marketplace_fixture_asset_manifest_invalid"
    ) {
      throw error;
    }
    throw new Error("uat_marketplace_fixture_asset_missing");
  }

  if (
    details.size !== entry.sizeBytes ||
    bytes.byteLength !== entry.sizeBytes ||
    bytes.byteLength > MAXIMUM_ASSET_SIZE_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    throw new Error("uat_marketplace_fixture_asset_manifest_invalid");
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== entry.sha256) {
    throw new Error("uat_marketplace_fixture_asset_checksum_mismatch");
  }

  return { relativePath: entry.relativePath, bytes, contentType: "image/jpeg" };
}

function isSafeRelativePath(path: string): boolean {
  if (
    path.includes("\\") ||
    path.startsWith("/") ||
    path.includes("\0") ||
    path === MANIFEST_FILE
  ) {
    return false;
  }
  const segments = path.split("/");
  return segments.every((segment) => segment && segment !== "." && segment !== "..");
}

function toPortableRelativePath(root: string, absolutePath: string): string {
  const path = relative(root, absolutePath);
  if (!path || path.startsWith("..") || path.startsWith(sep)) {
    throw new Error("uat_marketplace_fixture_asset_manifest_invalid");
  }
  return path.split(sep).join("/");
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
