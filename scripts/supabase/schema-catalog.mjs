import { createHash } from "node:crypto";

import postgres from "postgres";

import {
  DatabaseToolingError,
  ensureLocalSupabaseStarted,
  runSupabase,
} from "./database-tooling.mjs";

const APPLICATION_ROLES_SQL = "ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']::text[]";

const catalogQueries = Object.freeze({
  relations: `
    SELECT
      relation.relname AS relation_name,
      relation.relkind::text AS relation_kind,
      relation.relrowsecurity AS row_level_security,
      relation.relforcerowsecurity AS force_row_level_security
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
    ORDER BY relation.relname
  `,
  columns: `
    SELECT
      relation.relname AS relation_name,
      attribute.attnum::integer AS ordinal_position,
      attribute.attname AS column_name,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
      attribute.attnotnull AS not_null,
      attribute.attidentity::text AS identity_behavior,
      attribute.attgenerated::text AS generated_behavior,
      pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, true) AS default_expression
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
    LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = relation.oid
      AND default_value.adnum = attribute.attnum
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    ORDER BY relation.relname, attribute.attnum
  `,
  constraints: `
    SELECT
      COALESCE(relation.relname, domain_type.typname) AS object_name,
      constraint_entry.conname AS constraint_name,
      constraint_entry.contype::text AS constraint_type,
      constraint_entry.condeferrable AS deferrable,
      constraint_entry.condeferred AS initially_deferred,
      constraint_entry.convalidated AS validated,
      pg_catalog.pg_get_constraintdef(constraint_entry.oid, true) AS definition
    FROM pg_catalog.pg_constraint AS constraint_entry
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = constraint_entry.connamespace
    LEFT JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_entry.conrelid
    LEFT JOIN pg_catalog.pg_type AS domain_type ON domain_type.oid = constraint_entry.contypid
    WHERE namespace.nspname = 'public'
    ORDER BY object_name, constraint_entry.conname
  `,
  indexes: `
    SELECT
      table_relation.relname AS relation_name,
      index_relation.relname AS index_name,
      index_entry.indisunique AS is_unique,
      index_entry.indisprimary AS is_primary,
      index_entry.indisvalid AS is_valid,
      pg_catalog.pg_get_indexdef(index_entry.indexrelid, 0, true) AS definition,
      pg_catalog.pg_get_expr(index_entry.indpred, index_entry.indrelid, true) AS predicate
    FROM pg_catalog.pg_index AS index_entry
    JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = index_entry.indrelid
    JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
    WHERE namespace.nspname = 'public'
    ORDER BY table_relation.relname, index_relation.relname
  `,
  triggers: `
    SELECT
      relation.relname AS relation_name,
      trigger_entry.tgname AS trigger_name,
      pg_catalog.pg_get_triggerdef(trigger_entry.oid, true) AS definition,
      pg_catalog.pg_get_expr(trigger_entry.tgqual, trigger_entry.tgrelid, true) AS condition
    FROM pg_catalog.pg_trigger AS trigger_entry
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_entry.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND NOT trigger_entry.tgisinternal
    ORDER BY relation.relname, trigger_entry.tgname
  `,
  functions: `
    SELECT
      procedure.proname AS function_name,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
      pg_catalog.pg_get_function_arguments(procedure.oid) AS arguments,
      pg_catalog.pg_get_function_result(procedure.oid) AS return_type,
      language.lanname AS language,
      procedure.prokind::text AS function_kind,
      procedure.provolatile::text AS volatility,
      procedure.prosecdef AS security_definer,
      procedure.proleakproof AS leakproof,
      procedure.proisstrict AS strict,
      procedure.proparallel::text AS parallel_safety,
      procedure.proconfig AS configuration,
      procedure.prosrc AS source
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_catalog.pg_language AS language ON language.oid = procedure.prolang
    WHERE namespace.nspname = 'public'
    ORDER BY procedure.proname, pg_catalog.pg_get_function_identity_arguments(procedure.oid)
  `,
  types: `
    SELECT
      type_entry.typname AS type_name,
      type_entry.typtype::text AS type_kind,
      pg_catalog.format_type(type_entry.typbasetype, type_entry.typtypmod) AS base_type,
      type_entry.typnotnull AS not_null,
      type_entry.typdefault AS default_expression,
      enum_entry.enumsortorder::text AS enum_sort_order,
      enum_entry.enumlabel AS enum_label
    FROM pg_catalog.pg_type AS type_entry
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = type_entry.typnamespace
    LEFT JOIN pg_catalog.pg_enum AS enum_entry ON enum_entry.enumtypid = type_entry.oid
    WHERE namespace.nspname = 'public'
      AND type_entry.typtype IN ('d', 'e')
    ORDER BY type_entry.typname, enum_entry.enumsortorder
  `,
  policies: `
    SELECT
      relation.relname AS relation_name,
      policy.polname AS policy_name,
      policy.polpermissive AS permissive,
      policy.polcmd::text AS command,
      ARRAY(
        SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE role.rolname END
        FROM pg_catalog.unnest(policy.polroles) AS role_oid
        LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = role_oid
        ORDER BY CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE role.rolname END
      ) AS roles,
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, true) AS qualification,
      pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, true) AS check_expression
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
    ORDER BY relation.relname, policy.polname
  `,
  relationGrants: `
    SELECT
      relation.relname AS relation_name,
      relation.relkind::text AS relation_kind,
      COALESCE(grantee.rolname, 'PUBLIC') AS grantee,
      privilege.privilege_type,
      privilege.is_grantable
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        relation.relacl,
        pg_catalog.acldefault(
          CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
          relation.relowner
        )
      )
    ) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND COALESCE(grantee.rolname, 'PUBLIC') = ANY (${APPLICATION_ROLES_SQL})
    ORDER BY relation.relname, grantee, privilege.privilege_type
  `,
  functionGrants: `
    SELECT
      procedure.proname AS function_name,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
      COALESCE(grantee.rolname, 'PUBLIC') AS grantee,
      privilege.privilege_type,
      privilege.is_grantable
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        procedure.proacl,
        pg_catalog.acldefault('f'::"char", procedure.proowner)
      )
    ) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND COALESCE(grantee.rolname, 'PUBLIC') = ANY (${APPLICATION_ROLES_SQL})
    ORDER BY procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid),
      grantee,
      privilege.privilege_type
  `,
});

export async function readApplicationSchemaCatalog(databaseUrl, options = {}) {
  const client = options.client ?? createDatabaseClient(databaseUrl);
  const ownsClient = !options.client;
  try {
    return await readApplicationSchemaCatalogWithClient(client);
  } catch (error) {
    if (error instanceof DatabaseToolingError) throw error;
    throw new DatabaseToolingError(
      "supabase_schema_catalog_read_failed",
      "Could not read the application schema catalog.",
      { cause: error },
    );
  } finally {
    if (ownsClient) await client.end({ timeout: 1 });
  }
}

export async function readApplicationSchemaCatalogWithClient(client) {
  const catalog = {};
  for (const [section, query] of Object.entries(catalogQueries)) {
    catalog[section] = normalizeCatalogValue(await client.unsafe(query));
  }
  return catalog;
}

export function compareApplicationSchemaCatalogs(localCatalog, hostedCatalog) {
  const localDigest = digestCatalog(localCatalog);
  const hostedDigest = digestCatalog(hostedCatalog);
  if (localDigest === hostedDigest) return { ok: true, digest: localDigest, section: null };

  const section = Object.keys(catalogQueries).find(
    (name) => JSON.stringify(localCatalog[name]) !== JSON.stringify(hostedCatalog[name]),
  );
  return { ok: false, localDigest, hostedDigest, section: section ?? "unknown" };
}

export function digestCatalog(catalog) {
  return createHash("sha256")
    .update(JSON.stringify(normalizeCatalogValue(catalog)))
    .digest("hex");
}

export function normalizeCatalogValue(value) {
  if (Array.isArray(value)) return value.map(normalizeCatalogValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeCatalogValue(entry)]),
    );
  }
  if (typeof value === "string") {
    return value
      .replace(/\r\n/gu, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();
  }
  return value;
}

export function readLocalDatabaseUrl() {
  ensureLocalSupabaseStarted();
  const output = runSupabase(["status", "--output", "env"], {
    capture: true,
    reason: "supabase_local_runtime_unavailable",
  });
  const match = output.match(/^DB_URL=["']?([^"'\r\n]+)["']?$/mu);
  if (!match) {
    throw new DatabaseToolingError(
      "supabase_local_runtime_unavailable",
      "The local Supabase database URL was not reported.",
    );
  }
  const url = new URL(match[1]);
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname)) {
    throw new DatabaseToolingError(
      "supabase_local_target_invalid",
      "Schema comparison requires the local Supabase database.",
    );
  }
  return url.toString();
}

export function createDatabaseClient(databaseUrl) {
  const url = new URL(databaseUrl);
  const local = new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname);
  return postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 1,
    prepare: false,
    ssl: local ? false : "require",
  });
}
