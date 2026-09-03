import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import catalog from "../../deployment/configuration-catalog.json";
import {
  assertBrowserOutputSafe,
  createBrowserBuildSentinels,
} from "./browser-output-contract.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { force: true, recursive: true });
});

function browserOutput(contents: string) {
  const root = mkdtempSync(join(tmpdir(), "bazoria-browser-output-"));
  temporaryDirectories.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  writeFileSync(join(assets, "application.js"), contents);
  return root;
}

describe("browser output contract", () => {
  it("accepts output without server names or sentinel values", () => {
    expect(
      assertBrowserOutputSafe({
        publicDirectory: browserOutput("const application = 'bazoria';"),
        forbiddenNames: ["server-only-name"],
        sentinels: [{ name: "secret", value: "synthetic-secret" }],
      }),
    ).toEqual({ filesScanned: 1 });
  });

  it("rejects a forbidden server-only name", () => {
    const secret = catalog.environmentVariables.find(
      (entry) => entry.valueClass === "server_secret" && entry.status === "active",
    );
    expect(secret).toBeDefined();

    expect(() =>
      assertBrowserOutputSafe({
        publicDirectory: browserOutput(`const leakedName = "${secret!.name}";`),
        forbiddenNames: [secret!.name],
        sentinels: [],
      }),
    ).toThrow(`forbidden server-only name ${secret!.name}`);
  });

  it("rejects a sentinel without printing its value", () => {
    const sentinel = createBrowserBuildSentinels(catalog, "fixed-nonce")[0];
    const action = () =>
      assertBrowserOutputSafe({
        publicDirectory: browserOutput(`const leakedValue = "${sentinel.value}";`),
        forbiddenNames: [],
        sentinels: [sentinel],
      });

    expect(action).toThrow(sentinel.name);
    try {
      action();
    } catch (error) {
      expect(String(error)).not.toContain(sentinel.value);
    }
  });

  it("creates a distinct sentinel for every active server secret and signed URL", () => {
    const sentinels = createBrowserBuildSentinels(catalog, "fixed-nonce");
    expect(new Set(sentinels.map((sentinel) => sentinel.value))).toHaveLength(sentinels.length);
    expect(sentinels.some((sentinel) => sentinel.name.includes("SIGNED_URL"))).toBe(true);
  });
});
