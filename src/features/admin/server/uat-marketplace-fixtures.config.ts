import { resolve } from "node:path";

import { z } from "zod";

export const UAT_MARKETPLACE_FIXTURE_PROJECT_REF = "jhkouuxouplqcfecjutd";
export const UAT_MARKETPLACE_FIXTURE_PASSWORD = "Bazoria-QA-2026!";

const environmentSchema = z
  .object({
    BAZORIA_ALLOW_UAT_FIXTURE_RESET: z.literal("true"),
    BAZORIA_PROTOTYPE_ADMIN_USER_IDS: z.string().optional().default(""),
    BAZORIA_UAT_FIXTURE_ASSET_DIR: z.string().trim().optional(),
    BAZORIA_UAT_DATABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
    SUPABASE_URL: z.string().url(),
  })
  .passthrough();

const uuidSchema = z.string().uuid();

export type UatMarketplaceFixtureMode = "reset" | "seed" | "verify";

export type UatMarketplaceFixtureConfig = {
  assetDirectory: string;
  mode: UatMarketplaceFixtureMode;
  preservedAdministratorUserIds: string[];
  projectRef: string;
  databaseUrl: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

export function readUatMarketplaceFixtureConfig(
  environment: NodeJS.ProcessEnv = process.env,
  arguments_: string[] = process.argv.slice(2),
  workingDirectory = process.cwd(),
): UatMarketplaceFixtureConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) throw new Error("uat_marketplace_fixture_configuration_invalid");

  const mode = parseMode(arguments_);
  const supabaseUrl = parsed.data.SUPABASE_URL.replace(/\/+$/u, "");
  const projectRef = projectRefFromSupabaseUrl(supabaseUrl);
  if (projectRef !== UAT_MARKETPLACE_FIXTURE_PROJECT_REF) {
    throw new Error("uat_marketplace_fixture_destination_refused");
  }
  assertUatDatabaseUrl(parsed.data.BAZORIA_UAT_DATABASE_URL);

  const preservedAdministratorUserIds = parseAdministratorUserIds(
    parsed.data.BAZORIA_PROTOTYPE_ADMIN_USER_IDS,
  );

  return {
    assetDirectory: resolve(
      workingDirectory,
      parsed.data.BAZORIA_UAT_FIXTURE_ASSET_DIR || ".uat-fixtures/0039c1",
    ),
    databaseUrl: parsed.data.BAZORIA_UAT_DATABASE_URL,
    mode,
    preservedAdministratorUserIds,
    projectRef,
    serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl,
  };
}

function assertUatDatabaseUrl(value: string): void {
  const url = new URL(value);
  const directHost = url.hostname === `db.${UAT_MARKETPLACE_FIXTURE_PROJECT_REF}.supabase.co`;
  const pooledUser = new RegExp(
    `^(?:postgres|cli_login_postgres)\\.${UAT_MARKETPLACE_FIXTURE_PROJECT_REF}$`,
    "u",
  ).test(decodeURIComponent(url.username));
  if (
    url.protocol !== "postgresql:" ||
    (!directHost && !pooledUser) ||
    !url.password ||
    url.pathname !== "/postgres"
  ) {
    throw new Error("uat_marketplace_fixture_database_destination_refused");
  }
}

function parseMode(arguments_: string[]): UatMarketplaceFixtureMode {
  if (arguments_.length !== 1 || !["reset", "seed", "verify"].includes(arguments_[0] ?? "")) {
    throw new Error("uat_marketplace_fixture_mode_invalid");
  }
  return arguments_[0] as UatMarketplaceFixtureMode;
}

function parseAdministratorUserIds(value: string): string[] {
  if (!value.trim()) return [];
  const identifiers = value.split(",").map((identifier) => identifier.trim());
  if (
    identifiers.some((identifier) => !identifier || !uuidSchema.safeParse(identifier).success) ||
    new Set(identifiers).size !== identifiers.length
  ) {
    throw new Error("uat_marketplace_fixture_administrator_allowlist_invalid");
  }
  return identifiers;
}

export function projectRefFromSupabaseUrl(value: string): string {
  const url = new URL(value);
  const match = /^([a-z0-9]{20})\.supabase\.co$/u.exec(url.hostname);
  if (!match || url.protocol !== "https:" || url.pathname !== "/") {
    throw new Error("uat_marketplace_fixture_destination_refused");
  }
  return match[1]!;
}
