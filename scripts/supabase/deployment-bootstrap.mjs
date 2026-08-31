import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  DatabaseToolingError,
  parseEnvironmentFile,
  repositoryRoot,
  runEnvironmentPreflight,
  validateEnvironmentTarget,
} from "./database-tooling.mjs";
import {
  assertEnvironmentBootstrapMayProceed,
  loadDeploymentEnvironmentInventory,
  loadReferenceData,
} from "./deployment-inventory.mjs";
import {
  compareApplicationSchemaCatalogs,
  createDatabaseClient,
  readApplicationSchemaCatalog,
  readLocalDatabaseUrl,
} from "./schema-catalog.mjs";

const BOOTSTRAP_KEY_NAMES = Object.freeze([
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

export function loadBootstrapEnvironmentTarget(environment, options = {}) {
  const root = options.root ?? repositoryRoot;
  const filePath = options.filePath ?? join(root, `.env.supabase.${environment}.local`);
  let values;
  try {
    values = parseEnvironmentFile(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof DatabaseToolingError) throw error;
    throw new DatabaseToolingError(
      "supabase_environment_configuration_invalid",
      `Missing ignored environment file ${basename(filePath)}.`,
      { cause: error },
    );
  }

  const target = validateEnvironmentTarget(environment, values, { filePath });
  const missing = BOOTSTRAP_KEY_NAMES.filter((name) => !values[name]?.trim());
  if (missing.length > 0) {
    throw new DatabaseToolingError(
      "supabase_bootstrap_configuration_invalid",
      `Missing bootstrap values: ${missing.join(", ")}.`,
    );
  }

  const publishableKey = values.SUPABASE_PUBLISHABLE_KEY.trim();
  const serviceRoleKey = values.SUPABASE_SERVICE_ROLE_KEY.trim();
  assertSupportedKey(publishableKey, "publishable");
  assertSupportedKey(serviceRoleKey, "service_role");
  if (publishableKey === serviceRoleKey) {
    throw new DatabaseToolingError(
      "supabase_bootstrap_configuration_invalid",
      "Publishable and service-role keys must be different.",
    );
  }

  return Object.freeze({ ...target, publishableKey, serviceRoleKey });
}

export async function verifyHostedDeploymentFoundation(target, dependencies = {}) {
  const output = dependencies.output ?? ((line) => process.stdout.write(`${line}\n`));
  const inventory =
    dependencies.inventory ?? loadDeploymentEnvironmentInventory(target.environment);
  const referenceData = dependencies.referenceData ?? loadReferenceData();
  const assertMayProceed = dependencies.assertMayProceed ?? assertEnvironmentBootstrapMayProceed;
  assertMayProceed(target.environment);
  validateInventoryAgainstTarget(inventory, target);

  const validateKeys = dependencies.validateKeys ?? validateProjectKeys;
  await validateKeys(target, dependencies);

  const preflight = dependencies.preflight ?? runEnvironmentPreflight;
  const preflightResult = await preflight(target, { ...dependencies, output });
  if (preflightResult.state !== "current") {
    throw new DatabaseToolingError(
      "supabase_bootstrap_database_not_current",
      `The ${target.environment} database state is ${preflightResult.state}.`,
    );
  }

  const localDatabaseUrl = dependencies.localDatabaseUrl ?? readLocalDatabaseUrl();
  const readCatalog = dependencies.readCatalog ?? readApplicationSchemaCatalog;
  const localCatalog = await readCatalog(localDatabaseUrl);
  const hostedCatalog = await readCatalog(target.databaseUrl);
  const comparison = compareApplicationSchemaCatalogs(localCatalog, hostedCatalog);
  if (!comparison.ok) {
    throw new DatabaseToolingError(
      "supabase_hosted_schema_drift",
      `Hosted schema differs from clean local schema in ${comparison.section}.`,
    );
  }
  output(`application_schema_digest=${comparison.digest}`);

  const readReference = dependencies.readReference ?? readHostedReferenceData;
  const hostedReference = await readReference(target.databaseUrl);
  assertReferenceDataMatches(referenceData, hostedReference);
  output(
    `reference_data=root:1 leaves:${referenceData.leafCategories.length} audiences:${referenceData.productAudiences.length}`,
  );
  output(`deployment_foundation=${target.environment}:verified_read_only`);
  return {
    environment: target.environment,
    projectRef: target.projectRef,
    migrationHead: preflightResult.localMigrations.at(-1)?.version ?? null,
    schemaDigest: comparison.digest,
  };
}

export async function validateProjectKeys(target, options = {}) {
  const request = options.request ?? fetch;
  await validateProjectKey(target, target.publishableKey, "publishable", request);
  await validateProjectKey(target, target.serviceRoleKey, "service_role", request);
}

export async function readHostedReferenceData(databaseUrl, options = {}) {
  const client = options.client ?? createDatabaseClient(databaseUrl);
  const ownsClient = !options.client;
  try {
    const categories = await client.unsafe(`
      SELECT
        category.slug,
        category.product_code_prefix,
        parent.slug AS parent_slug
      FROM public.categories AS category
      LEFT JOIN public.categories AS parent ON parent.id = category.parent_id
      ORDER BY category.slug
    `);
    const [audienceConstraint] = await client.unsafe(`
      SELECT pg_catalog.pg_get_constraintdef(constraint_entry.oid, true) AS definition
      FROM pg_catalog.pg_constraint AS constraint_entry
      JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_entry.conrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'product_audience_memberships'
        AND constraint_entry.conname = 'product_audience_memberships_audience_check'
    `);
    return {
      categories: categories.map((row) => ({
        slug: row.slug,
        productCodePrefix: row.product_code_prefix,
        parentSlug: row.parent_slug,
      })),
      productAudiences: extractTextLiterals(audienceConstraint?.definition ?? ""),
    };
  } catch (error) {
    throw new DatabaseToolingError(
      "supabase_reference_data_read_failed",
      "Could not read hosted reference data.",
      { cause: error },
    );
  } finally {
    if (ownsClient) await client.end({ timeout: 1 });
  }
}

export function assertReferenceDataMatches(expected, actual) {
  const expectedCategories = [
    {
      slug: expected.rootCategory.slug,
      productCodePrefix: expected.rootCategory.productCodePrefix,
      parentSlug: null,
    },
    ...expected.leafCategories.map((category) => ({
      slug: category.slug,
      productCodePrefix: category.productCodePrefix,
      parentSlug: expected.rootCategory.slug,
    })),
  ].sort((left, right) => left.slug.localeCompare(right.slug));
  const actualCategories = [...actual.categories].sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );
  const expectedAudiences = [...expected.productAudiences].sort();
  const actualAudiences = [...new Set(actual.productAudiences)].sort();

  if (
    JSON.stringify(actualCategories) !== JSON.stringify(expectedCategories) ||
    JSON.stringify(actualAudiences) !== JSON.stringify(expectedAudiences)
  ) {
    throw new DatabaseToolingError(
      "supabase_reference_data_mismatch",
      "Hosted categories or product audiences differ from deployment/reference-data.json.",
    );
  }
}

export function validateInventoryAgainstTarget(inventory, target) {
  const databaseUrl = new URL(target.databaseUrl);
  const migrationUser = decodeURIComponent(databaseUrl.username);
  const databaseName = databaseUrl.pathname.replace(/^\//u, "");
  if (
    inventory.environment !== target.environment ||
    inventory.supabase.projectRef !== target.projectRef ||
    inventory.supabase.projectUrl !== target.supabaseUrl ||
    inventory.supabase.database.host !== target.databaseHost ||
    inventory.supabase.database.name !== databaseName ||
    inventory.supabase.database.migrationUserForm !== migrationUser
  ) {
    throw new DatabaseToolingError(
      "supabase_deployment_inventory_mismatch",
      `The ${target.environment} inventory does not match its configured database target.`,
    );
  }
}

function assertSupportedKey(key, expectedRole) {
  if (expectedRole === "publishable" && key.startsWith("sb_publishable_")) return;
  if (expectedRole === "service_role" && key.startsWith("sb_secret_")) return;
  const payload = decodeJwtPayload(key);
  const actualRole = payload?.role;
  if (
    (expectedRole === "publishable" && actualRole === "anon") ||
    (expectedRole === "service_role" && actualRole === "service_role")
  ) {
    return;
  }
  throw new DatabaseToolingError(
    "supabase_bootstrap_configuration_invalid",
    `SUPABASE_${expectedRole === "publishable" ? "PUBLISHABLE" : "SERVICE_ROLE"}_KEY has the wrong key type.`,
  );
}

function decodeJwtPayload(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function validateProjectKey(target, key, label, request) {
  let response;
  try {
    response = await request(`${target.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new DatabaseToolingError(
      "supabase_bootstrap_key_validation_failed",
      `Could not validate the ${label} key against ${target.environment}.`,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new DatabaseToolingError(
      "supabase_bootstrap_key_validation_failed",
      `The ${label} key was rejected by ${target.environment}.`,
    );
  }
}

function extractTextLiterals(definition) {
  return [...definition.matchAll(/'((?:''|[^'])+)'::text/gu)].map((match) =>
    match[1].replace(/''/gu, "'"),
  );
}
