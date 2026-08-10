import { describe, expect, it } from "vitest";

import {
  readUatMarketplaceFixtureConfig,
  UAT_MARKETPLACE_FIXTURE_PROJECT_REF,
} from "./uat-marketplace-fixtures.config";

const validEnvironment = {
  BAZORIA_ALLOW_UAT_FIXTURE_RESET: "true",
  BAZORIA_UAT_DATABASE_URL:
    "postgresql://postgres.jhkouuxouplqcfecjutd:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  SUPABASE_URL: `https://${UAT_MARKETPLACE_FIXTURE_PROJECT_REF}.supabase.co`,
};

describe("readUatMarketplaceFixtureConfig", () => {
  it("accepts only the guarded hosted UAT project", () => {
    expect(readUatMarketplaceFixtureConfig(validEnvironment, ["seed"], "/workspace")).toEqual({
      assetDirectory: "/workspace/.uat-fixtures/0039c1",
      databaseUrl:
        "postgresql://postgres.jhkouuxouplqcfecjutd:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
      mode: "seed",
      preservedAdministratorUserIds: [],
      projectRef: UAT_MARKETPLACE_FIXTURE_PROJECT_REF,
      serviceRoleKey: "sb_secret_test",
      supabaseUrl: `https://${UAT_MARKETPLACE_FIXTURE_PROJECT_REF}.supabase.co`,
    });
  });

  it("accepts a short-lived linked Supabase CLI database login for the exact UAT project", () => {
    const result = readUatMarketplaceFixtureConfig(
      {
        ...validEnvironment,
        BAZORIA_UAT_DATABASE_URL:
          "postgresql://cli_login_postgres.jhkouuxouplqcfecjutd:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
      },
      ["verify"],
    );

    expect(result.projectRef).toBe(UAT_MARKETPLACE_FIXTURE_PROJECT_REF);
  });

  it.each([
    [{ ...validEnvironment, BAZORIA_ALLOW_UAT_FIXTURE_RESET: undefined }],
    [{ ...validEnvironment, BAZORIA_ALLOW_UAT_FIXTURE_RESET: "false" }],
    [{ ...validEnvironment, SUPABASE_URL: "http://127.0.0.1:54321" }],
    [{ ...validEnvironment, SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co" }],
    [
      {
        ...validEnvironment,
        BAZORIA_UAT_DATABASE_URL:
          "postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:secret@pooler.supabase.com:6543/postgres",
      },
    ],
  ])("refuses an unconfirmed or non-UAT destination", (environment) => {
    expect(() => readUatMarketplaceFixtureConfig(environment, ["seed"])).toThrow();
  });

  it("validates the preserved administrator allowlist", () => {
    const administratorId = "00000000-0000-4000-8000-000000000001";
    const result = readUatMarketplaceFixtureConfig(
      { ...validEnvironment, BAZORIA_PROTOTYPE_ADMIN_USER_IDS: ` ${administratorId} ` },
      ["reset"],
    );
    expect(result.preservedAdministratorUserIds).toEqual([administratorId]);

    expect(() =>
      readUatMarketplaceFixtureConfig(
        { ...validEnvironment, BAZORIA_PROTOTYPE_ADMIN_USER_IDS: "not-a-uuid" },
        ["reset"],
      ),
    ).toThrow("uat_marketplace_fixture_administrator_allowlist_invalid");
  });

  it("rejects extra or unsupported command arguments", () => {
    expect(() => readUatMarketplaceFixtureConfig(validEnvironment, [])).toThrow(
      "uat_marketplace_fixture_mode_invalid",
    );
    expect(() => readUatMarketplaceFixtureConfig(validEnvironment, ["seed", "extra"])).toThrow(
      "uat_marketplace_fixture_mode_invalid",
    );
  });
});
