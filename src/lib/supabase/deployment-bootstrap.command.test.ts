import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEPLOYED_PROJECTS } from "../../../scripts/supabase/database-tooling.mjs";
import {
  assertReferenceDataMatches,
  loadBootstrapEnvironmentTarget,
  verifyHostedDeploymentFoundation,
} from "../../../scripts/supabase/deployment-bootstrap.mjs";
import {
  assertEnvironmentBootstrapMayProceed,
  deploymentEnvironmentInventorySchema,
  referenceDataSchema,
  validateEnvironmentInventoryIdentity,
} from "../../../scripts/supabase/deployment-inventory.mjs";
import {
  compareApplicationSchemaCatalogs,
  normalizeCatalogValue,
} from "../../../scripts/supabase/schema-catalog.mjs";
import { runStorageSmoke } from "../../../scripts/supabase/storage-smoke.mjs";

const temporaryDirectories: string[] = [];
const pngBytes = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("0038c2 deployment inventory", () => {
  it("accepts the exact isolated UAT inventory and reference manifest", () => {
    const inventory = environmentInventory("uat");
    expect(deploymentEnvironmentInventorySchema.parse(inventory)).toEqual(inventory);
    expect(() => validateEnvironmentInventoryIdentity("uat", inventory)).not.toThrow();
    expect(referenceDataSchema.parse(referenceData())).toEqual(referenceData());
  });

  it("rejects mixed project identities and duplicate reference entries", () => {
    const inventory = environmentInventory("uat");
    inventory.supabase.projectRef = DEPLOYED_PROJECTS.production;
    expect(() => validateEnvironmentInventoryIdentity("uat", inventory)).toThrowError(
      expect.objectContaining({ reason: "supabase_deployment_inventory_mismatch" }),
    );

    const reference = referenceData();
    reference.leafCategories[1] = reference.leafCategories[0];
    expect(referenceDataSchema.safeParse(reference).success).toBe(false);
  });

  it("blocks production until UAT has a completed bootstrap and administrator", () => {
    const directory = temporaryRoot();
    const environmentDirectory = join(directory, "deployment", "environments");
    const inventory = environmentInventory("uat");
    mkdirSync(environmentDirectory, { recursive: true });
    writeFileSync(join(environmentDirectory, "uat.json"), JSON.stringify(inventory));
    expect(() => assertEnvironmentBootstrapMayProceed("production", directory)).toThrowError(
      expect.objectContaining({ reason: "supabase_production_bootstrap_blocked" }),
    );

    const completedInventory = {
      ...inventory,
      ownership: {
        ...inventory.ownership,
        administratorAllowlist: ["00000000-0000-4000-8000-000000000001"],
      },
      bootstrap: {
        gitCommit: "a".repeat(40),
        migrationHead: "20260831120000",
        verifiedAt: "2026-08-31T12:00:00.000Z",
      },
    };
    writeFileSync(join(environmentDirectory, "uat.json"), JSON.stringify(completedInventory));
    expect(() => assertEnvironmentBootstrapMayProceed("production", directory)).not.toThrow();
  });

  it("loads bootstrap keys only from the ignored environment file", () => {
    const directory = temporaryRoot();
    const projectRef = DEPLOYED_PROJECTS.uat;
    writeFileSync(
      join(directory, ".env.supabase.uat.local"),
      [
        `BAZORIA_SUPABASE_PROJECT_REF=${projectRef}`,
        `SUPABASE_URL=https://${projectRef}.supabase.co`,
        `BAZORIA_SUPABASE_DATABASE_URL=postgresql://postgres.${projectRef}:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
        "SUPABASE_PUBLISHABLE_KEY=sb_publishable_example",
        "SUPABASE_SERVICE_ROLE_KEY=sb_secret_example",
      ].join("\n"),
    );
    expect(loadBootstrapEnvironmentTarget("uat", { root: directory })).toMatchObject({
      projectRef,
      publishableKey: "sb_publishable_example",
      serviceRoleKey: "sb_secret_example",
    });
  });

  it("rejects missing or swapped bootstrap key types", () => {
    const directory = temporaryRoot();
    const projectRef = DEPLOYED_PROJECTS.uat;
    writeFileSync(
      join(directory, ".env.supabase.uat.local"),
      [
        `BAZORIA_SUPABASE_PROJECT_REF=${projectRef}`,
        `SUPABASE_URL=https://${projectRef}.supabase.co`,
        `BAZORIA_SUPABASE_DATABASE_URL=postgresql://postgres.${projectRef}:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
        "SUPABASE_PUBLISHABLE_KEY=sb_secret_wrong",
        "SUPABASE_SERVICE_ROLE_KEY=sb_publishable_wrong",
      ].join("\n"),
    );
    expect(() => loadBootstrapEnvironmentTarget("uat", { root: directory })).toThrowError(
      expect.objectContaining({ reason: "supabase_bootstrap_configuration_invalid" }),
    );
  });
});

describe("0038c2 schema and reference verification", () => {
  it("normalizes catalog object keys and reports the first drifting section", () => {
    const local = {
      relations: [{ relation_name: "products", source: "line 1  \r\nline 2" }],
      functions: [],
    };
    const equivalent = {
      relations: [{ source: "line 1\nline 2", relation_name: "products" }],
      functions: [],
    };
    const changed = {
      relations: [{ source: "line 1\nline 3", relation_name: "products" }],
      functions: [],
    };
    expect(normalizeCatalogValue(local)).toEqual(normalizeCatalogValue(equivalent));
    expect(compareApplicationSchemaCatalogs(local, equivalent).ok).toBe(true);
    expect(compareApplicationSchemaCatalogs(local, changed)).toMatchObject({
      ok: false,
      section: "relations",
    });
  });

  it("rejects missing, additional, or differently nested reference rows", () => {
    const expected = referenceData();
    const actual = hostedReference(expected);
    expect(() => assertReferenceDataMatches(expected, actual)).not.toThrow();
    actual.categories[1].parentSlug = null;
    expect(() => assertReferenceDataMatches(expected, actual)).toThrowError(
      expect.objectContaining({ reason: "supabase_reference_data_mismatch" }),
    );
  });

  it("runs key validation, preflight, schema comparison, and reference checks in order", async () => {
    const target = bootstrapTarget("uat");
    const calls: string[] = [];
    const catalog = { relations: [], functions: [] };
    const result = await verifyHostedDeploymentFoundation(target, {
      inventory: environmentInventory("uat"),
      referenceData: referenceData(),
      localDatabaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      validateKeys: vi.fn(async () => calls.push("keys")),
      preflight: vi.fn(async () => {
        calls.push("preflight");
        return {
          state: "current",
          localMigrations: [{ version: "20260831120000" }],
          remoteVersions: ["20260831120000"],
        };
      }),
      readCatalog: vi.fn(async (databaseUrl: string) => {
        calls.push(databaseUrl.includes("127.0.0.1") ? "local-catalog" : "hosted-catalog");
        return catalog;
      }),
      readReference: vi.fn(async () => {
        calls.push("reference");
        return hostedReference(referenceData());
      }),
      output: vi.fn(),
    });
    expect(calls).toEqual(["keys", "preflight", "local-catalog", "hosted-catalog", "reference"]);
    expect(result).toMatchObject({ environment: "uat", migrationHead: "20260831120000" });
  });
});

describe("0038c2 storage smoke", () => {
  it("checks confirmation before key validation or storage access", async () => {
    const verifyFoundation = vi.fn();
    const gateway = storageGateway();
    await expect(
      runStorageSmoke(bootstrapTarget("uat"), DEPLOYED_PROJECTS.production, {
        inventory: environmentInventory("uat"),
        verifyFoundation,
        gateway,
      }),
    ).rejects.toMatchObject({ reason: "supabase_storage_smoke_confirmation_mismatch" });
    expect(verifyFoundation).not.toHaveBeenCalled();
    expect(gateway.calls).toEqual([]);
  });

  it("verifies all buckets and removes every synthetic object", async () => {
    const gateway = storageGateway();
    const output: string[] = [];
    const result = await runStorageSmoke(bootstrapTarget("uat"), DEPLOYED_PROJECTS.uat, {
      inventory: environmentInventory("uat"),
      verifyFoundation: vi.fn(),
      gateway,
      requestId: "request-id",
      sleep: async () => {
        gateway.expired = true;
      },
      output: (line: string) => output.push(line),
    });
    expect(result.buckets).toHaveLength(3);
    expect(gateway.objects.size).toBe(0);
    expect(output).toContain("storage_cleanup=uat:verified");
  });

  it("still cleans up objects when content verification fails", async () => {
    const gateway = storageGateway();
    gateway.returnWrongBytes = true;
    await expect(
      runStorageSmoke(bootstrapTarget("uat"), DEPLOYED_PROJECTS.uat, {
        inventory: environmentInventory("uat"),
        verifyFoundation: vi.fn(),
        gateway,
        requestId: "request-id",
        sleep: vi.fn(),
        output: vi.fn(),
      }),
    ).rejects.toMatchObject({ reason: "supabase_storage_smoke_content_mismatch" });
    expect(gateway.objects.size).toBe(0);
  });
});

function environmentInventory(environment: "uat" | "production") {
  const projectRef = DEPLOYED_PROJECTS[environment];
  const origin = environment === "uat" ? "https://uat2026.bazoria.pl" : "https://bazoria.pl";
  return {
    schemaVersion: 1 as const,
    environment,
    supabase: {
      projectRef,
      organizationId: "organization-id",
      region: "eu-central-1" as const,
      projectUrl: `https://${projectRef}.supabase.co`,
      database: {
        host: "aws-0-eu-central-1.pooler.supabase.com",
        name: "postgres" as const,
        migrationUserForm: `postgres.${projectRef}`,
      },
      plan: "Free",
      backups: { managed: false, retention: "none", pointInTimeRecovery: false },
    },
    application: { canonicalOrigin: origin },
    authentication: {
      siteUrl: origin,
      redirectUrls: [`${origin}/auth`, `${origin}/auth/recovery`],
      googleCallbackUrl: `https://${projectRef}.supabase.co/auth/v1/callback`,
    },
    storage: {
      requiredBuckets: [
        {
          id: "product-draft-images" as const,
          public: false,
          fileSizeLimitBytes: (20 * 1024 * 1024) as const,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
        },
        {
          id: "product-images" as const,
          public: true,
          fileSizeLimitBytes: (20 * 1024 * 1024) as const,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
        },
        {
          id: "seller-profile-images" as const,
          public: false,
          fileSizeLimitBytes: (20 * 1024 * 1024) as const,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
        },
      ],
    },
    ownership: {
      administratorAllowlist: [],
      externalProviderConfiguration: { googleEnabled: false as const },
    },
    bootstrap: { gitCommit: null, migrationHead: null, verifiedAt: null },
  };
}

function referenceData() {
  return {
    schemaVersion: 1 as const,
    rootCategory: { slug: "fashion" as const, productCodePrefix: "F" as const },
    leafCategories: [
      ["blazers", "BLZ"],
      ["cardigans", "CRD"],
      ["coats", "COA"],
      ["dresses", "DRS"],
      ["hoodies", "HOD"],
      ["jackets", "JKT"],
      ["jeans", "JNS"],
      ["leggings", "LEG"],
      ["shorts", "SHT"],
      ["skirts", "SKT"],
      ["sportswear", "SPW"],
      ["sweaters", "SWE"],
      ["sweatpants", "SWP"],
      ["sweatshirts", "SWS"],
      ["t-shirts", "TSH"],
      ["tracksuit-sets", "TSS"],
      ["trousers", "TRO"],
      ["vests", "VST"],
    ].map(([slug, productCodePrefix]) => ({ slug, productCodePrefix })),
    productAudiences: ["women", "men", "kids"] as const,
  };
}

function hostedReference(expected: ReturnType<typeof referenceData>) {
  return {
    categories: [
      { slug: "fashion", productCodePrefix: "F", parentSlug: null },
      ...expected.leafCategories.map(({ slug, productCodePrefix }) => ({
        slug,
        productCodePrefix,
        parentSlug: "fashion",
      })),
    ],
    productAudiences: ["women", "men", "kids"],
  };
}

function bootstrapTarget(environment: "uat" | "production") {
  const projectRef = DEPLOYED_PROJECTS[environment];
  return {
    environment,
    projectRef,
    supabaseUrl: `https://${projectRef}.supabase.co`,
    databaseUrl: `postgresql://postgres.${projectRef}:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    databaseHost: "aws-0-eu-central-1.pooler.supabase.com",
    publishableKey: "sb_publishable_example",
    serviceRoleKey: "sb_secret_example",
  };
}

function temporaryRoot() {
  const directory = mkdtempSync(join(tmpdir(), "bazoria-deployment-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function storageGateway() {
  const objects = new Set<string>();
  return {
    calls: [] as string[],
    objects,
    expired: false,
    returnWrongBytes: false,
    async createSignedUpload(bucket: string, objectKey: string) {
      this.calls.push(`signed-upload:${bucket}`);
      return `token:${objectKey}`;
    },
    async uploadWithSignedToken(bucket: string, objectKey: string) {
      this.calls.push(`upload:${bucket}`);
      objects.add(`${bucket}/${objectKey}`);
    },
    async createSignedRead(bucket: string, objectKey: string) {
      this.expired = false;
      return `signed://${bucket}/${objectKey}`;
    },
    async readUrl(url: string) {
      if (url.startsWith("signed://") && this.expired) return { ok: false, bytes: null };
      return { ok: true, bytes: this.returnWrongBytes ? new Uint8Array([0]) : pngBytes };
    },
    async serviceUpload(bucket: string, objectKey: string) {
      objects.add(`${bucket}/${objectKey}`);
    },
    publicUrl(bucket: string, objectKey: string) {
      return `public://${bucket}/${objectKey}`;
    },
    async anonymousUploadIsDenied() {
      return true;
    },
    async publicReadIsDenied() {
      return true;
    },
    async remove(bucket: string, objectKeys: string[]) {
      for (const objectKey of objectKeys) objects.delete(`${bucket}/${objectKey}`);
    },
    async objectIsMissing(bucket: string, objectKey: string) {
      return !objects.has(`${bucket}/${objectKey}`);
    },
  };
}
