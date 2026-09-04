import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";
import { format, resolveConfig } from "prettier";

export const DEPLOYED_PROJECTS = Object.freeze({
  uat: "mekobnkujzpzeiwmecyy",
  production: "njtgjrctfmtvackjmlww",
});

export const LEGACY_PROJECT_REFS = new Set(["jhkouuxouplqcfecjutd"]);
export const REQUIRED_ENVIRONMENT_KEYS = Object.freeze([
  "BAZORIA_SUPABASE_PROJECT_REF",
  "SUPABASE_URL",
  "BAZORIA_SUPABASE_DATABASE_URL",
]);

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const MIGRATION_FILE_PATTERN = /^(\d{14})_.+\.sql$/;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, "../..");
const supabaseExecutable = join(
  repositoryRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);
const generatedTypesPath = join(repositoryRoot, "src/lib/supabase/types.ts");
let prettierConfigurationPromise;

export class DatabaseToolingError extends Error {
  constructor(reason, message = reason, options = undefined) {
    super(message, options);
    this.name = "DatabaseToolingError";
    this.reason = reason;
  }
}

export function assertSupportedRuntime({
  nodeVersion = process.versions.node,
  npmVersion = readNpmVersion(),
} = {}) {
  if (compareVersions(nodeVersion, "22.13.0") < 0) {
    throw new DatabaseToolingError(
      "database_tooling_runtime_invalid",
      "Node.js 22.13.0 or newer is required.",
    );
  }

  if (npmVersion && compareVersions(npmVersion, "10.9.2") < 0) {
    throw new DatabaseToolingError(
      "database_tooling_runtime_invalid",
      "npm 10.9.2 or newer is required.",
    );
  }
}

export function parseEnvironmentArguments(argv, { write = false } = {}) {
  let environment;
  let confirmProject;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--environment") {
      environment = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--confirm-project") {
      confirmProject = argv[index + 1];
      index += 1;
      continue;
    }
    throw new DatabaseToolingError(
      "supabase_environment_argument_invalid",
      `Unsupported argument ${argument}.`,
    );
  }

  if (!environment || !(environment in DEPLOYED_PROJECTS)) {
    throw new DatabaseToolingError(
      "supabase_environment_unsupported",
      "Select exactly one environment with --environment uat or --environment production.",
    );
  }
  if (write && !confirmProject) {
    throw new DatabaseToolingError(
      "supabase_migration_confirmation_required",
      "Remote migration requires --confirm-project with the selected project reference.",
    );
  }

  return { environment, confirmProject };
}

export function loadEnvironmentTarget(environment, options = {}) {
  const root = options.root ?? repositoryRoot;
  const filePath = options.filePath ?? join(root, `.env.supabase.${environment}.local`);
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new DatabaseToolingError(
      "supabase_environment_configuration_invalid",
      `Missing ignored environment file ${basename(filePath)}.`,
      { cause: error },
    );
  }

  return validateEnvironmentTarget(environment, parseEnvironmentFile(source), {
    filePath,
  });
}

export function parseEnvironmentFile(source) {
  const values = {};
  for (const [lineIndex, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!match) {
      throw new DatabaseToolingError(
        "supabase_environment_configuration_invalid",
        `Invalid environment assignment on line ${lineIndex + 1}.`,
      );
    }
    const [, key, rawValue] = match;
    if (Object.hasOwn(values, key)) {
      throw new DatabaseToolingError(
        "supabase_environment_configuration_invalid",
        `Duplicate environment value ${key}.`,
      );
    }
    values[key] = unquoteEnvironmentValue(rawValue.trim());
  }
  return values;
}

export function validateEnvironmentTarget(environment, values, options = {}) {
  if (!(environment in DEPLOYED_PROJECTS)) {
    throw new DatabaseToolingError(
      "supabase_environment_unsupported",
      "Only uat and production database environments are supported.",
    );
  }

  const missing = REQUIRED_ENVIRONMENT_KEYS.filter((key) => !values[key]?.trim());
  if (missing.length > 0) {
    throw new DatabaseToolingError(
      "supabase_environment_configuration_invalid",
      `Missing required values: ${missing.join(", ")}.`,
    );
  }

  const projectRef = values.BAZORIA_SUPABASE_PROJECT_REF.trim();
  if (!PROJECT_REF_PATTERN.test(projectRef)) {
    throw new DatabaseToolingError(
      "supabase_environment_configuration_invalid",
      "BAZORIA_SUPABASE_PROJECT_REF is not a valid Supabase project reference.",
    );
  }
  if (LEGACY_PROJECT_REFS.has(projectRef)) {
    throw new DatabaseToolingError(
      "supabase_legacy_project_rejected",
      "The retired Supabase project cannot be selected.",
    );
  }

  const expectedProjectRef = DEPLOYED_PROJECTS[environment];
  if (projectRef !== expectedProjectRef) {
    const otherEnvironment = Object.entries(DEPLOYED_PROJECTS).find(
      ([name, ref]) => name !== environment && ref === projectRef,
    )?.[0];
    throw new DatabaseToolingError(
      "supabase_environment_target_mismatch",
      otherEnvironment
        ? `The ${environment} command received the ${otherEnvironment} project.`
        : `The configured project does not match the declared ${environment} environment.`,
    );
  }

  const applicationUrl = parseUrl(
    values.SUPABASE_URL,
    "supabase_environment_configuration_invalid",
  );
  if (applicationUrl.protocol !== "https:") {
    throw new DatabaseToolingError(
      "supabase_environment_configuration_invalid",
      "SUPABASE_URL must use HTTPS.",
    );
  }
  const applicationProjectRef = projectRefFromSupabaseUrl(applicationUrl);
  if (applicationProjectRef !== projectRef) {
    throw new DatabaseToolingError(
      "supabase_environment_target_mismatch",
      "SUPABASE_URL and BAZORIA_SUPABASE_PROJECT_REF identify different projects.",
    );
  }

  const databaseUrl = parseUrl(
    values.BAZORIA_SUPABASE_DATABASE_URL,
    "supabase_environment_configuration_invalid",
  );
  if (!new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol)) {
    throw new DatabaseToolingError(
      "supabase_environment_configuration_invalid",
      "BAZORIA_SUPABASE_DATABASE_URL must be a PostgreSQL connection URL.",
    );
  }
  const databaseProjectRefs = projectRefsFromDatabaseUrl(databaseUrl);
  if (databaseProjectRefs.size !== 1 || !databaseProjectRefs.has(projectRef)) {
    throw new DatabaseToolingError(
      "supabase_environment_target_mismatch",
      "The database connection and project reference identify different projects.",
    );
  }

  return Object.freeze({
    environment,
    projectRef,
    supabaseUrl: applicationUrl.toString().replace(/\/$/u, ""),
    databaseUrl: databaseUrl.toString(),
    databaseHost: databaseUrl.hostname,
    sourceFile: options.filePath,
  });
}

export function listLocalMigrationVersions(root = repositoryRoot) {
  const migrationDirectory = join(root, "supabase", "migrations");
  const migrations = readdirSync(migrationDirectory)
    .map((fileName) => ({ fileName, match: fileName.match(MIGRATION_FILE_PATTERN) }))
    .filter(({ match }) => match)
    .map(({ fileName, match }) => ({ fileName, version: match[1] }))
    .sort((left, right) => left.version.localeCompare(right.version));

  const duplicate = migrations.find(
    (migration, index) => index > 0 && migrations[index - 1].version === migration.version,
  );
  if (duplicate) {
    throw new DatabaseToolingError(
      "supabase_local_migration_history_invalid",
      `Duplicate local migration version ${duplicate.version}.`,
    );
  }
  return migrations;
}

export function classifyMigrationHistory(localMigrations, remoteVersions) {
  const localVersions = localMigrations.map(({ version }) => version);
  const normalizedRemote = remoteVersions.map(String);
  if (normalizedRemote.length === 0) return "uninitialized";
  if (normalizedRemote.length > localVersions.length) return "unknown_history";
  for (let index = 0; index < normalizedRemote.length; index += 1) {
    if (normalizedRemote[index] !== localVersions[index]) return "unknown_history";
  }
  return normalizedRemote.length === localVersions.length ? "current" : "behind";
}

export async function runEnvironmentPreflight(target, dependencies = {}) {
  const output = dependencies.output ?? ((line) => process.stdout.write(`${line}\n`));
  const localMigrations = dependencies.localMigrations ?? listLocalMigrationVersions();
  const readMigrationVersions = dependencies.readMigrationVersions ?? readRemoteMigrationVersions;
  const runSupabaseCommand = dependencies.runSupabaseCommand ?? runSupabase;
  const readFoundation = dependencies.readFoundation ?? readRemoteFoundation;

  output(`environment=${target.environment}`);
  output(`project_ref=${target.projectRef}`);
  output(`database_host=${target.databaseHost}`);
  output(
    `local_migration_range=${localMigrations[0]?.version ?? "none"}..${localMigrations.at(-1)?.version ?? "none"} count=${localMigrations.length}`,
  );

  const remoteVersions = await readMigrationVersions(target.databaseUrl);
  let state = classifyMigrationHistory(localMigrations, remoteVersions);
  output(formatMigrationRange(localMigrations, remoteVersions, state));

  if (state !== "unknown_history") {
    const dryRunOutput = runSupabaseCommand(
      ["db", "push", "--db-url", target.databaseUrl, "--dry-run", "--yes"],
      {
        allowNoop: true,
        capture: true,
        reason: "supabase_remote_preflight_failed",
      },
    );
    writeSanitizedCommandOutput(dryRunOutput, output);
  }

  if (state === "current") {
    const generatedTypes = await formatGeneratedTypes(
      runSupabaseCommand(
        ["gen", "types", "typescript", "--db-url", target.databaseUrl, "--schema", "public"],
        { capture: true, reason: "supabase_remote_preflight_failed" },
      ),
    );
    const checkedTypes = await formatGeneratedTypes(readFileSync(generatedTypesPath, "utf8"));
    const foundation = await readFoundation(target.databaseUrl);
    if (generatedTypes !== checkedTypes || !foundation.ok) state = "schema_drift";
  }

  output(`schema_state=${state}`);
  return { state, localMigrations, remoteVersions };
}

export async function runEnvironmentMigration(target, confirmation, dependencies = {}) {
  if (confirmation !== target.projectRef) {
    throw new DatabaseToolingError(
      "supabase_migration_confirmation_mismatch",
      "The confirmation project does not match the selected target.",
    );
  }

  const runSupabaseCommand = dependencies.runSupabaseCommand ?? runSupabase;
  const preflight = dependencies.preflight ?? runEnvironmentPreflight;
  const before = await preflight(target, dependencies);
  assertPreflightMayMigrate(before.state);
  if (before.state === "current") return before;

  runSupabaseCommand(["db", "push", "--db-url", target.databaseUrl, "--yes"], {
    capture: false,
    reason: "supabase_migration_failed",
  });
  const after = await preflight(target, dependencies);
  if (after.state !== "current") {
    throw new DatabaseToolingError(
      after.state === "schema_drift" ? "supabase_schema_drift" : "supabase_migration_failed",
      `Migration completed but target state is ${after.state}.`,
    );
  }
  return after;
}

export function assertPreflightMayMigrate(state) {
  if (state === "unknown_history") {
    throw new DatabaseToolingError(
      "supabase_unknown_migration_history",
      "The remote migration history is not a valid prefix of local history.",
    );
  }
  if (state === "schema_drift") {
    throw new DatabaseToolingError(
      "supabase_schema_drift",
      "Migration versions match but the required schema does not.",
    );
  }
}

export function assertEnvironmentCurrent(state) {
  if (state !== "current") {
    throw new DatabaseToolingError(
      "supabase_environment_database_not_current",
      `The hosted database state is ${state}; fixture operations require the checked-out migration head.`,
    );
  }
}

export function ensureDockerRuntime() {
  const result = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (
    result.error ||
    result.status !== 0 ||
    !/^\d+\.\d+(?:\.\d+)?(?:[-+].+)?$/u.test(result.stdout.trim())
  ) {
    throw new DatabaseToolingError(
      "supabase_local_runtime_unavailable",
      "Start Docker Desktop or another Docker-compatible runtime.",
      { cause: result.error },
    );
  }
}

export function ensureLocalSupabaseStarted(dependencies = {}) {
  const ensureDocker = dependencies.ensureDocker ?? ensureDockerRuntime;
  const spawnCommand = dependencies.spawnCommand ?? spawnSync;
  const runCommand = dependencies.runCommand ?? runSupabase;

  ensureDocker();
  const status = spawnCommand(supabaseExecutable, ["status", "--output", "env"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (status.status !== 0) {
    runCommand(["start"], {
      capture: true,
      reason: "supabase_local_start_failed",
    });
  }
}

export async function runLocalDatabaseAction(action, dependencies = {}) {
  const assertRuntime = dependencies.assertRuntime ?? assertSupportedRuntime;
  const ensureDocker = dependencies.ensureDocker ?? ensureDockerRuntime;
  const ensureStarted = dependencies.ensureStarted ?? ensureLocalSupabaseStarted;
  const runCommand = dependencies.runCommand ?? runSupabase;
  const checkGeneratedTypes = dependencies.checkGeneratedTypes ?? checkLocalGeneratedTypes;

  assertRuntime();
  if (action === "start") {
    await ensureStarted();
    return;
  }

  if (action === "reset") {
    ensureDocker();
    runCommand(["db", "reset", "--local", "--no-seed"], {
      capture: false,
      reason: "supabase_local_migration_failed",
    });
    return;
  }
  if (action === "test") {
    ensureDocker();
    runCommand(["test", "db", "--local"], {
      capture: false,
      reason: "supabase_sql_contract_test_failed",
    });
    return;
  }
  if (action === "verify") {
    await ensureStarted();
    runCommand(["db", "reset", "--local", "--no-seed"], {
      capture: false,
      reason: "supabase_local_migration_failed",
    });
    runCommand(["db", "lint", "--local", "--level", "warning", "--fail-on", "error"], {
      capture: false,
      reason: "supabase_local_lint_failed",
    });
    runCommand(["test", "db", "--local"], {
      capture: false,
      reason: "supabase_sql_contract_test_failed",
    });
    return checkGeneratedTypes();
  }
  throw new DatabaseToolingError(
    "supabase_local_action_invalid",
    `Unsupported local database action ${action}.`,
  );
}

export async function generateLocalTypes() {
  assertSupportedRuntime();
  ensureDockerRuntime();
  const generated = await formatGeneratedTypes(
    runSupabase(["gen", "types", "typescript", "--local", "--schema", "public"], {
      capture: true,
      reason: "supabase_type_generation_failed",
    }),
  );
  writeFileSync(generatedTypesPath, generated);
}

export async function checkLocalGeneratedTypes() {
  assertSupportedRuntime();
  ensureDockerRuntime();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "bazoria-supabase-types-"));
  const temporaryFile = join(temporaryDirectory, "types.ts");
  try {
    const generated = await formatGeneratedTypes(
      runSupabase(["gen", "types", "typescript", "--local", "--schema", "public"], {
        capture: true,
        reason: "supabase_type_generation_failed",
      }),
    );
    writeFileSync(temporaryFile, generated);
    const checked = await formatGeneratedTypes(await readFile(generatedTypesPath, "utf8"));
    if (generated !== checked) {
      throw new DatabaseToolingError(
        "supabase_generated_type_drift",
        "Generated database types differ from src/lib/supabase/types.ts.",
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function runSupabase(args, options = {}) {
  if (!existsSync(supabaseExecutable)) {
    throw new DatabaseToolingError(
      "supabase_cli_unavailable",
      "Run npm ci to install the pinned Supabase command-line interface.",
    );
  }
  return runExecutable(supabaseExecutable, args, options);
}

export function normalizeGeneratedTypes(value) {
  return `${String(value).replace(/\r\n/gu, "\n").trimEnd()}\n`;
}

export async function formatGeneratedTypes(value) {
  prettierConfigurationPromise ??= resolveConfig(generatedTypesPath);
  const configuration = (await prettierConfigurationPromise) ?? {};
  return normalizeGeneratedTypes(
    await format(normalizeGeneratedTypes(value), {
      ...configuration,
      filepath: generatedTypesPath,
    }),
  );
}

export function redactSensitiveText(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/giu, "[REDACTED_DATABASE_URL]")
    .replace(/https?:\/\/[^\s'"`?]+\?[^\s'"`]+/giu, "[REDACTED_URL]")
    .replace(
      /\b(?:sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/gu,
      "[REDACTED_KEY]",
    );
}

export function reportDatabaseToolingError(error) {
  const reason = error instanceof DatabaseToolingError ? error.reason : "database_tooling_failed";
  const message = error instanceof Error ? redactSensitiveText(error.message) : reason;
  process.stderr.write(`${reason}: ${message}\n`);
}

async function readRemoteMigrationVersions(databaseUrl) {
  const sql = createRemoteDatabaseClient(databaseUrl);
  try {
    const rows = await sql.unsafe(
      "SELECT version::text AS version FROM supabase_migrations.schema_migrations ORDER BY version",
    );
    return rows.map(({ version }) => version);
  } catch (error) {
    if (new Set(["3F000", "42P01"]).has(error?.code)) return [];
    throw new DatabaseToolingError(
      "supabase_remote_preflight_failed",
      "Could not read remote migration history.",
      { cause: error },
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function readRemoteFoundation(databaseUrl) {
  const sql = createRemoteDatabaseClient(databaseUrl);
  try {
    const [result] = await sql.unsafe(`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_extension extension
          JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
          WHERE extension.extname = 'unaccent' AND namespace.nspname = 'extensions'
        )
        AND EXISTS (
          SELECT 1 FROM pg_extension extension
          JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
          WHERE extension.extname = 'pgcrypto' AND namespace.nspname = 'extensions'
        )
        AND (
          SELECT count(*) = 3
          FROM storage.buckets bucket
          WHERE (bucket.id, bucket.public, bucket.file_size_limit, bucket.allowed_mime_types) IN (
            ('product-images', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
            ('product-draft-images', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
            ('seller-profile-images', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
          )
        )
        AND EXISTS (
          SELECT 1 FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'storage'
            AND relation.relname = 'objects'
            AND relation.relrowsecurity
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies policy
          WHERE policy.schemaname = 'storage'
            AND policy.tablename = 'objects'
            AND policy.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
            AND policy.roles && ARRAY['anon', 'authenticated']::name[]
        )
        AND has_table_privilege('service_role', 'storage.objects', 'INSERT')
        AND has_table_privilege('service_role', 'storage.objects', 'UPDATE')
        AND has_table_privilege('service_role', 'storage.objects', 'DELETE')
        AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'anon')
        AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'authenticated')
        AS ok
    `);
    return { ok: result?.ok === true };
  } catch (error) {
    throw new DatabaseToolingError(
      "supabase_remote_preflight_failed",
      "Could not verify the remote deployment foundation.",
      { cause: error },
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function createRemoteDatabaseClient(databaseUrl) {
  return postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 1,
    ssl: "require",
  });
}

function runExecutable(executable, args, options = {}) {
  const capture = options.capture ?? false;
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: capture ? "pipe" : "inherit",
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (options.allowNoop && result.status !== 0 && /remote database is up to date/iu.test(output)) {
    return capture ? result.stdout : "";
  }
  if (result.error || result.status !== 0) {
    throw new DatabaseToolingError(
      options.reason ?? "database_tooling_command_failed",
      options.message ?? "Database tooling command failed.",
      { cause: result.error },
    );
  }
  return capture ? result.stdout : "";
}

function formatMigrationRange(localMigrations, remoteVersions, state) {
  if (state === "unknown_history") return "migration_range=investigation_required";
  const remaining = localMigrations.slice(remoteVersions.length);
  if (remaining.length === 0) return "migration_range=none";
  return `migration_range=${remaining[0].version}..${remaining.at(-1).version} count=${remaining.length}`;
}

function projectRefFromSupabaseUrl(url) {
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u);
  if (!match) {
    throw new DatabaseToolingError(
      "supabase_environment_configuration_invalid",
      "SUPABASE_URL is not a hosted Supabase project URL.",
    );
  }
  return match[1];
}

function projectRefsFromDatabaseUrl(url) {
  const refs = new Set();
  const hostMatch = url.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/u);
  if (hostMatch) refs.add(hostMatch[1]);
  const username = decodeURIComponent(url.username);
  const userMatch = username.match(/^(?:cli_login_)?postgres\.([a-z0-9]{20})$/u);
  if (userMatch) refs.add(userMatch[1]);
  return refs;
}

function parseUrl(value, reason) {
  try {
    return new URL(value);
  } catch (error) {
    throw new DatabaseToolingError(reason, "Configured URL is invalid.", { cause: error });
  }
}

function unquoteEnvironmentValue(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function readNpmVersion() {
  const result = spawnSync("npm", ["--version"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function writeSanitizedCommandOutput(commandOutput, output) {
  for (const line of redactSensitiveText(commandOutput).trim().split(/\r?\n/u)) {
    if (line) output(line);
  }
}
