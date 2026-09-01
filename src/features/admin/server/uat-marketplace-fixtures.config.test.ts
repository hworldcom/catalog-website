import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readUatMarketplaceFixtureConfig } from "./uat-marketplace-fixtures.config";

const UAT_PROJECT_REF = "mekobnkujzpzeiwmecyy";
const PRODUCTION_PROJECT_REF = "njtgjrctfmtvackjmlww";
const UAT_ADMINISTRATOR_ID = "aed397bc-27cf-483d-bcd2-4455ccb83bc0";

const commonEnvironment = {
  BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
  BAZORIA_UAT_DATABASE_URL:
    "postgresql://postgres.mekobnkujzpzeiwmecyy:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
  BAZORIA_UAT_FIXTURE_ADMIN_USER_ID: UAT_ADMINISTRATOR_ID,
  BAZORIA_UAT_FIXTURE_PROJECT_REF: UAT_PROJECT_REF,
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  SUPABASE_URL: `https://${UAT_PROJECT_REF}.supabase.co`,
};

const seedEnvironment = {
  ...commonEnvironment,
  BAZORIA_UAT_FIXTURE_USER_PASSWORD: "fixture-password",
};

describe("readUatMarketplaceFixtureConfig", () => {
  it("loads the checked-in UAT inventory and returns seed-only values", () => {
    expect(readUatMarketplaceFixtureConfig(seedEnvironment, ["seed"])).toEqual({
      administratorUserId: UAT_ADMINISTRATOR_ID,
      administratorUserIds: [UAT_ADMINISTRATOR_ID],
      assetDirectory: resolve("deployment/fixtures/uat/0038d/assets"),
      databaseUrl: commonEnvironment.BAZORIA_UAT_DATABASE_URL,
      fixtureUserPassword: "fixture-password",
      mode: "seed",
      projectRef: UAT_PROJECT_REF,
      serviceRoleKey: "sb_secret_test",
      supabaseUrl: `https://${UAT_PROJECT_REF}.supabase.co`,
    });
  });

  it("uses an explicit seed asset directory", () => {
    const result = readUatMarketplaceFixtureConfig(
      { ...seedEnvironment, BAZORIA_UAT_FIXTURE_ASSET_DIR: "/tmp/fixture-assets" },
      ["seed"],
    );
    expect(result).toMatchObject({ mode: "seed", assetDirectory: "/tmp/fixture-assets" });
  });

  it("requires reset confirmation only for reset", () => {
    const result = readUatMarketplaceFixtureConfig(
      {
        ...commonEnvironment,
        BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION: `RESET-UAT-${UAT_PROJECT_REF}`,
      },
      ["reset"],
    );
    expect(result).toEqual({
      administratorUserId: UAT_ADMINISTRATOR_ID,
      administratorUserIds: [UAT_ADMINISTRATOR_ID],
      databaseUrl: commonEnvironment.BAZORIA_UAT_DATABASE_URL,
      mode: "reset",
      projectRef: UAT_PROJECT_REF,
      serviceRoleKey: "sb_secret_test",
      supabaseUrl: `https://${UAT_PROJECT_REF}.supabase.co`,
    });

    expect(() => readUatMarketplaceFixtureConfig(commonEnvironment, ["reset"])).toThrow(
      "uat_marketplace_fixture_configuration_invalid",
    );
    expect(() =>
      readUatMarketplaceFixtureConfig(
        { ...commonEnvironment, BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION: "RESET-UAT-wrong" },
        ["reset"],
      ),
    ).toThrow("uat_marketplace_fixture_reset_confirmation_invalid");
  });

  it("requires neither password nor reset confirmation for verify", () => {
    expect(readUatMarketplaceFixtureConfig(commonEnvironment, ["verify"])).toEqual({
      administratorUserId: UAT_ADMINISTRATOR_ID,
      administratorUserIds: [UAT_ADMINISTRATOR_ID],
      assetDirectory: resolve(process.cwd(), "deployment/fixtures/uat/0038d/assets"),
      databaseUrl: commonEnvironment.BAZORIA_UAT_DATABASE_URL,
      mode: "verify",
      projectRef: UAT_PROJECT_REF,
      serviceRoleKey: "sb_secret_test",
      supabaseUrl: `https://${UAT_PROJECT_REF}.supabase.co`,
    });
  });

  it("does not grant reset permission to seed or verify", () => {
    for (const mode of ["seed", "verify"] as const) {
      const environment =
        mode === "seed"
          ? {
              ...seedEnvironment,
              BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION: `RESET-UAT-${UAT_PROJECT_REF}`,
            }
          : {
              ...commonEnvironment,
              BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION: `RESET-UAT-${UAT_PROJECT_REF}`,
            };
      expect(() => readUatMarketplaceFixtureConfig(environment, [mode])).toThrow(
        "uat_marketplace_fixture_reset_confirmation_invalid",
      );
    }
  });

  it("requires the fixture password only for seed", () => {
    expect(() => readUatMarketplaceFixtureConfig(commonEnvironment, ["seed"])).toThrow(
      "uat_marketplace_fixture_configuration_invalid invalid_fields=BAZORIA_UAT_FIXTURE_USER_PASSWORD",
    );
    expect(() =>
      readUatMarketplaceFixtureConfig(
        { ...commonEnvironment, BAZORIA_UAT_FIXTURE_USER_PASSWORD: "too-short" },
        ["seed"],
      ),
    ).toThrow(
      "uat_marketplace_fixture_configuration_invalid invalid_fields=BAZORIA_UAT_FIXTURE_USER_PASSWORD",
    );
  });

  it("reports only invalid field names and never their values", () => {
    const invalidPassword = "private";
    let error: unknown;

    try {
      readUatMarketplaceFixtureConfig(
        {
          ...commonEnvironment,
          BAZORIA_UAT_FIXTURE_USER_PASSWORD: invalidPassword,
          SUPABASE_SERVICE_ROLE_KEY: " ",
        },
        ["seed"],
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "uat_marketplace_fixture_configuration_invalid invalid_fields=BAZORIA_UAT_FIXTURE_USER_PASSWORD,SUPABASE_SERVICE_ROLE_KEY",
    );
    expect((error as Error).message).not.toContain(invalidPassword);
  });

  it("accepts direct and short-lived UAT database connections", () => {
    const direct = readUatMarketplaceFixtureConfig(
      {
        ...commonEnvironment,
        BAZORIA_UAT_DATABASE_URL:
          "postgresql://postgres:secret@db.mekobnkujzpzeiwmecyy.supabase.co:5432/postgres",
      },
      ["verify"],
    );
    expect(direct.projectRef).toBe(UAT_PROJECT_REF);

    const cliLogin = readUatMarketplaceFixtureConfig(
      {
        ...commonEnvironment,
        BAZORIA_UAT_DATABASE_URL:
          "postgresql://cli_login_postgres.mekobnkujzpzeiwmecyy:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
      },
      ["verify"],
    );
    expect(cliLogin.projectRef).toBe(UAT_PROJECT_REF);
  });

  it.each([
    [{ ...seedEnvironment, BAZORIA_DEPLOYMENT_ENVIRONMENT: "production" }],
    [{ ...seedEnvironment, BAZORIA_UAT_FIXTURE_PROJECT_REF: PRODUCTION_PROJECT_REF }],
    [{ ...seedEnvironment, SUPABASE_URL: `https://${UAT_PROJECT_REF}.supabase.co/path` }],
    [{ ...seedEnvironment, SUPABASE_URL: "http://127.0.0.1:54321" }],
    [
      {
        ...seedEnvironment,
        BAZORIA_UAT_FIXTURE_PROJECT_REF: "aaaaaaaaaaaaaaaaaaaa",
        SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
        BAZORIA_UAT_DATABASE_URL:
          "postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
      },
    ],
  ])("refuses invalid or caller-defined destinations", (environment) => {
    expect(() => readUatMarketplaceFixtureConfig(environment, ["seed"])).toThrow();
  });

  it("refuses a database connection for a different or unknown project", () => {
    for (const databaseUrl of [
      `postgresql://postgres.${PRODUCTION_PROJECT_REF}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
      "postgresql://postgres.mekobnkujzpzeiwmecyy:secret@unknown.supabase.com:5432/postgres",
      "postgresql://postgres.mekobnkujzpzeiwmecyy:secret@127.0.0.1:5432/postgres",
    ]) {
      expect(() =>
        readUatMarketplaceFixtureConfig(
          { ...commonEnvironment, BAZORIA_UAT_DATABASE_URL: databaseUrl },
          ["verify"],
        ),
      ).toThrow("uat_marketplace_fixture_database_destination_refused");
    }
  });

  it("requires the single administrator to be in the UAT inventory", () => {
    expect(() =>
      readUatMarketplaceFixtureConfig(
        {
          ...commonEnvironment,
          BAZORIA_UAT_FIXTURE_ADMIN_USER_ID: "00000000-0000-4000-8000-000000000001",
        },
        ["verify"],
      ),
    ).toThrow("uat_marketplace_fixture_administrator_invalid");
  });

  it("fails closed when deployment inventories cannot be loaded", () => {
    expect(() =>
      readUatMarketplaceFixtureConfig(commonEnvironment, ["verify"], "/missing/repository"),
    ).toThrow("uat_marketplace_fixture_configuration_invalid");
  });

  it("rejects extra or unsupported command arguments before parsing configuration", () => {
    expect(() => readUatMarketplaceFixtureConfig({}, [])).toThrow(
      "uat_marketplace_fixture_mode_invalid",
    );
    expect(() => readUatMarketplaceFixtureConfig({}, ["seed", "extra"])).toThrow(
      "uat_marketplace_fixture_mode_invalid",
    );
  });
});
