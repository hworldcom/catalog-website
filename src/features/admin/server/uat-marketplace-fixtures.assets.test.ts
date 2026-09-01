import { cp, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadUatMarketplaceFixtureAssetBundle } from "./uat-marketplace-fixtures.assets";
import { fixtureAssetFiles } from "./uat-marketplace-fixtures.manifest";

const SOURCE_BUNDLE = resolve("deployment/fixtures/uat/0038d/assets");

describe("loadUatMarketplaceFixtureAssetBundle", () => {
  it("validates all tracked synthetic assets on a clean checkout", async () => {
    const assets = await loadUatMarketplaceFixtureAssetBundle(SOURCE_BUNDLE);
    expect(assets.size).toBe(28);
    expect([...assets.keys()].sort()).toEqual(fixtureAssetFiles().sort());
    expect([...assets.values()].every((asset) => asset.bytes.byteLength > 0)).toBe(true);
  });

  it("rejects changed asset bytes with a stable checksum failure", async () => {
    await withBundle(async (root) => {
      const path = join(root, fixtureAssetFiles()[0]!);
      const bytes = new Uint8Array(await readFile(path));
      bytes[100] = (bytes[100]! + 1) % 256;
      await writeFile(path, bytes);
      await expect(loadUatMarketplaceFixtureAssetBundle(root)).rejects.toThrow(
        "uat_marketplace_fixture_asset_checksum_mismatch",
      );
    });
  });

  it("rejects a missing declared asset", async () => {
    await withBundle(async (root) => {
      await unlink(join(root, fixtureAssetFiles()[0]!));
      await expect(loadUatMarketplaceFixtureAssetBundle(root)).rejects.toThrow(
        "uat_marketplace_fixture_asset_missing",
      );
    });
  });

  it("rejects an undeclared file", async () => {
    await withBundle(async (root) => {
      await writeFile(join(root, "undeclared.jpg"), new Uint8Array([0xff, 0xd8, 0xff]));
      await expect(loadUatMarketplaceFixtureAssetBundle(root)).rejects.toThrow(
        "uat_marketplace_fixture_asset_manifest_invalid",
      );
    });
  });

  it("rejects duplicate and unsafe manifest paths", async () => {
    await withBundle(async (root) => {
      const manifest = await readManifest(root);
      manifest.assets.push({ ...manifest.assets[0]! });
      await writeManifest(root, manifest);
      await expect(loadUatMarketplaceFixtureAssetBundle(root)).rejects.toThrow(
        "uat_marketplace_fixture_asset_manifest_invalid",
      );
    });

    await withBundle(async (root) => {
      const manifest = await readManifest(root);
      manifest.assets[0]!.relativePath = "../outside.jpg";
      await writeManifest(root, manifest);
      await expect(loadUatMarketplaceFixtureAssetBundle(root)).rejects.toThrow(
        "uat_marketplace_fixture_asset_manifest_invalid",
      );
    });
  });

  it("rejects unsupported media types and byte-size mismatches", async () => {
    await withBundle(async (root) => {
      const manifest = await readManifest(root);
      manifest.assets[0]!.mediaType = "image/png";
      await writeManifest(root, manifest);
      await expect(loadUatMarketplaceFixtureAssetBundle(root)).rejects.toThrow(
        "uat_marketplace_fixture_asset_manifest_invalid",
      );
    });

    await withBundle(async (root) => {
      const manifest = await readManifest(root);
      manifest.assets[0]!.sizeBytes += 1;
      await writeManifest(root, manifest);
      await expect(loadUatMarketplaceFixtureAssetBundle(root)).rejects.toThrow(
        "uat_marketplace_fixture_asset_manifest_invalid",
      );
    });
  });
});

type MutableManifest = {
  assets: Array<{
    mediaType: string;
    relativePath: string;
    sizeBytes: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

async function withBundle(run: (root: string) => Promise<void>): Promise<void> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "bazoria-uat-fixtures-"));
  const root = join(temporaryDirectory, "assets");
  try {
    await cp(SOURCE_BUNDLE, root, { recursive: true });
    await run(root);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function readManifest(root: string): Promise<MutableManifest> {
  return JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as MutableManifest;
}

async function writeManifest(root: string, manifest: MutableManifest): Promise<void> {
  await writeFile(join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
