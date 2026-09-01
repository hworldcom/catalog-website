import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { resolve } from "node:path";

import { z } from "zod";

const PROJECT_REFERENCE_PATTERN = /^[a-z0-9]{20}$/u;
const UAT_INVENTORY_PATH = "deployment/environments/uat.json";
const PRODUCTION_INVENTORY_PATH = "deployment/environments/production.json";
const DEFAULT_ASSET_DIRECTORY = "deployment/fixtures/uat/0038d/assets";

const baseEnvironmentSchema = z
  .object({
    BAZORIA_DEPLOYMENT_ENVIRONMENT: z.literal("uat"),
    BAZORIA_UAT_DATABASE_URL: z.string().trim().min(1),
    BAZORIA_UAT_FIXTURE_ADMIN_USER_ID: z.string().uuid(),
    BAZORIA_UAT_FIXTURE_PROJECT_REF: z.string().regex(PROJECT_REFERENCE_PATTERN),
    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
    SUPABASE_URL: z.string().trim().min(1),
  })
  .passthrough();

const seedEnvironmentSchema = baseEnvironmentSchema.extend({
  BAZORIA_UAT_FIXTURE_ASSET_DIR: z.string().trim().min(1).optional(),
  BAZORIA_UAT_FIXTURE_USER_PASSWORD: z.string().min(12).max(128),
});

const resetEnvironmentSchema = baseEnvironmentSchema.extend({
  BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION: z.string().trim().min(1),
});

const deploymentInventorySchema = z.object({
  environment: z.enum(["uat", "production"]),
  supabase: z.object({
    projectRef: z.string().regex(PROJECT_REFERENCE_PATTERN),
    database: z.object({
      host: z.string().trim().min(1),
      name: z.literal("postgres"),
      migrationUserForm: z.string().trim().min(1),
    }),
  }),
  ownership: z.object({
    administratorAllowlist: z.array(z.string().uuid()),
  }),
});

type DeploymentInventory = z.infer<typeof deploymentInventorySchema>;
type ParsedFixtureEnvironment = z.infer<typeof baseEnvironmentSchema> & {
  BAZORIA_UAT_FIXTURE_ASSET_DIR?: string;
  BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION?: string;
  BAZORIA_UAT_FIXTURE_USER_PASSWORD?: string;
};

type UatMarketplaceFixtureCommonConfig = {
  administratorUserIds: string[];
  administratorUserId: string;
  databaseUrl: string;
  projectRef: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

export type UatMarketplaceFixtureConfig =
  | (UatMarketplaceFixtureCommonConfig & { mode: "reset" })
  | (UatMarketplaceFixtureCommonConfig & {
      assetDirectory: string;
      fixtureUserPassword: string;
      mode: "seed";
    })
  | (UatMarketplaceFixtureCommonConfig & {
      assetDirectory: string;
      mode: "verify";
    });

export type UatMarketplaceFixtureMode = UatMarketplaceFixtureConfig["mode"];

export function readUatMarketplaceFixtureConfig(
  environment: NodeJS.ProcessEnv = process.env,
  arguments_: string[] = process.argv.slice(2),
  workingDirectory = process.cwd(),
): UatMarketplaceFixtureConfig {
  const mode = parseMode(arguments_);
  const parsed = parseEnvironment(mode, environment);
  const inventories = loadDeploymentInventories(workingDirectory);
  const uatInventory = inventories.uat;

  if (
    uatInventory.environment !== "uat" ||
    inventories.production.environment !== "production" ||
    uatInventory.supabase.projectRef === inventories.production.supabase.projectRef
  ) {
    throw new Error("uat_marketplace_fixture_destination_refused");
  }

  const projectRef = parsed.BAZORIA_UAT_FIXTURE_PROJECT_REF;
  if (projectRef !== uatInventory.supabase.projectRef) {
    throw new Error("uat_marketplace_fixture_destination_refused");
  }

  const supabaseUrl = assertSupabaseUrl(parsed.SUPABASE_URL, projectRef);
  assertUatDatabaseUrl(parsed.BAZORIA_UAT_DATABASE_URL, uatInventory);

  const administratorUserId = parsed.BAZORIA_UAT_FIXTURE_ADMIN_USER_ID.toLowerCase();
  if (!uatInventory.ownership.administratorAllowlist.includes(administratorUserId)) {
    throw new Error("uat_marketplace_fixture_administrator_invalid");
  }

  const common = {
    administratorUserIds: [...uatInventory.ownership.administratorAllowlist],
    administratorUserId,
    databaseUrl: parsed.BAZORIA_UAT_DATABASE_URL,
    projectRef,
    serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl,
  } satisfies UatMarketplaceFixtureCommonConfig;

  if (mode === "reset") {
    const expectedConfirmation = `RESET-UAT-${projectRef}`;
    if (parsed.BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION !== expectedConfirmation) {
      throw new Error("uat_marketplace_fixture_reset_confirmation_invalid");
    }
    return { ...common, mode };
  }

  if (environment.BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION !== undefined) {
    throw new Error("uat_marketplace_fixture_reset_confirmation_invalid");
  }

  if (mode === "seed") {
    return {
      ...common,
      assetDirectory: resolve(
        workingDirectory,
        parsed.BAZORIA_UAT_FIXTURE_ASSET_DIR ?? DEFAULT_ASSET_DIRECTORY,
      ),
      fixtureUserPassword: parsed.BAZORIA_UAT_FIXTURE_USER_PASSWORD!,
      mode,
    };
  }

  return {
    ...common,
    assetDirectory: resolve(
      workingDirectory,
      parsed.BAZORIA_UAT_FIXTURE_ASSET_DIR ?? DEFAULT_ASSET_DIRECTORY,
    ),
    mode,
  };
}

function parseEnvironment(
  mode: UatMarketplaceFixtureMode,
  environment: NodeJS.ProcessEnv,
): ParsedFixtureEnvironment {
  const schema =
    mode === "seed"
      ? seedEnvironmentSchema
      : mode === "reset"
        ? resetEnvironmentSchema
        : baseEnvironmentSchema;
  const parsed = schema.safeParse(environment);
  if (!parsed.success) throw new Error("uat_marketplace_fixture_configuration_invalid");
  return parsed.data as ParsedFixtureEnvironment;
}

function loadDeploymentInventories(workingDirectory: string): {
  production: DeploymentInventory;
  uat: DeploymentInventory;
} {
  return {
    production: readDeploymentInventory(resolve(workingDirectory, PRODUCTION_INVENTORY_PATH)),
    uat: readDeploymentInventory(resolve(workingDirectory, UAT_INVENTORY_PATH)),
  };
}

function readDeploymentInventory(path: string): DeploymentInventory {
  try {
    return deploymentInventorySchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    throw new Error("uat_marketplace_fixture_configuration_invalid");
  }
}

function assertSupabaseUrl(value: string, projectRef: string): string {
  const expected = `https://${projectRef}.supabase.co`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("uat_marketplace_fixture_destination_refused");
  }
  if (
    value !== expected ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    isIP(url.hostname) !== 0
  ) {
    throw new Error("uat_marketplace_fixture_destination_refused");
  }
  return expected;
}

function assertUatDatabaseUrl(value: string, inventory: DeploymentInventory): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("uat_marketplace_fixture_database_destination_refused");
  }

  const projectRef = inventory.supabase.projectRef;
  const username = decodeURIComponent(url.username);
  const directConnection =
    url.hostname === `db.${projectRef}.supabase.co` && username === "postgres";
  const pooledConnection =
    url.hostname === inventory.supabase.database.host &&
    (username === inventory.supabase.database.migrationUserForm ||
      username === `cli_login_postgres.${projectRef}`);

  if (
    url.protocol !== "postgresql:" ||
    isIP(url.hostname) !== 0 ||
    (!directConnection && !pooledConnection) ||
    !url.password ||
    url.pathname !== `/${inventory.supabase.database.name}` ||
    url.hash
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
