import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  DEPLOYED_PROJECTS,
  DatabaseToolingError,
  assertEnvironmentCurrent,
  assertSupportedRuntime,
  classifyMigrationHistory,
  normalizeGeneratedTypes,
  parseEnvironmentArguments,
  parseEnvironmentFile,
  redactSensitiveText,
  repositoryRoot,
  runEnvironmentMigration,
  runEnvironmentPreflight,
  validateEnvironmentTarget,
} from "../../../scripts/supabase/database-tooling.mjs";

const localMigrations = [
  { fileName: "20260101000000_first.sql", version: "20260101000000" },
  { fileName: "20260102000000_second.sql", version: "20260102000000" },
];

function environmentValues(environment: "uat" | "production") {
  const projectRef = DEPLOYED_PROJECTS[environment];
  return {
    BAZORIA_SUPABASE_PROJECT_REF: projectRef,
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    BAZORIA_SUPABASE_DATABASE_URL: `postgresql://postgres.${projectRef}:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
  };
}

describe("database tooling target validation", () => {
  it("parses the declared environment without accepting implicit targets", () => {
    expect(parseEnvironmentArguments(["--environment", "uat"])).toEqual({
      environment: "uat",
      confirmProject: undefined,
    });
    expect(() => parseEnvironmentArguments([])).toThrowError(
      expect.objectContaining({ reason: "supabase_environment_unsupported" }),
    );
    expect(() => parseEnvironmentArguments(["--environment", "staging"])).toThrowError(
      expect.objectContaining({ reason: "supabase_environment_unsupported" }),
    );
  });

  it("requires explicit project confirmation for writes", () => {
    expect(() =>
      parseEnvironmentArguments(["--environment", "production"], { write: true }),
    ).toThrowError(expect.objectContaining({ reason: "supabase_migration_confirmation_required" }));
  });

  it("parses comments, export assignments, and quoted values", () => {
    expect(
      parseEnvironmentFile(`
        # environment
        export BAZORIA_SUPABASE_PROJECT_REF='${DEPLOYED_PROJECTS.uat}'
        SUPABASE_URL="https://${DEPLOYED_PROJECTS.uat}.supabase.co"
      `),
    ).toEqual({
      BAZORIA_SUPABASE_PROJECT_REF: DEPLOYED_PROJECTS.uat,
      SUPABASE_URL: `https://${DEPLOYED_PROJECTS.uat}.supabase.co`,
    });
  });

  it.each(["uat", "production"] as const)("accepts an isolated %s target", (environment) => {
    const target = validateEnvironmentTarget(environment, environmentValues(environment));
    expect(target.projectRef).toBe(DEPLOYED_PROJECTS[environment]);
    expect(target.databaseHost).toBe("aws-0-eu-central-1.pooler.supabase.com");
  });

  it("accepts a direct database hostname identifying the selected project", () => {
    const values = environmentValues("production");
    values.BAZORIA_SUPABASE_DATABASE_URL = `postgresql://postgres:secret@db.${DEPLOYED_PROJECTS.production}.supabase.co:5432/postgres`;
    expect(validateEnvironmentTarget("production", values).projectRef).toBe(
      DEPLOYED_PROJECTS.production,
    );
  });

  it("rejects mixed deployed environments", () => {
    const values = environmentValues("uat");
    values.BAZORIA_SUPABASE_PROJECT_REF = DEPLOYED_PROJECTS.production;
    expect(() => validateEnvironmentTarget("uat", values)).toThrowError(
      expect.objectContaining({ reason: "supabase_environment_target_mismatch" }),
    );
  });

  it("rejects the retired project before opening a connection", () => {
    const legacy = "jhkouuxouplqcfecjutd";
    expect(() =>
      validateEnvironmentTarget("uat", {
        BAZORIA_SUPABASE_PROJECT_REF: legacy,
        SUPABASE_URL: `https://${legacy}.supabase.co`,
        BAZORIA_SUPABASE_DATABASE_URL: `postgresql://postgres.${legacy}:secret@pooler.supabase.com:6543/postgres`,
      }),
    ).toThrowError(expect.objectContaining({ reason: "supabase_legacy_project_rejected" }));
  });

  it("rejects a database connection for another project", () => {
    const values = environmentValues("uat");
    values.BAZORIA_SUPABASE_DATABASE_URL = `postgresql://postgres.${DEPLOYED_PROJECTS.production}:secret@pooler.supabase.com:6543/postgres`;
    expect(() => validateEnvironmentTarget("uat", values)).toThrowError(
      expect.objectContaining({ reason: "supabase_environment_target_mismatch" }),
    );
  });

  it("enforces the repository Node and npm minimums", () => {
    expect(() =>
      assertSupportedRuntime({ nodeVersion: "20.12.2", npmVersion: "10.9.2" }),
    ).toThrowError(expect.objectContaining({ reason: "database_tooling_runtime_invalid" }));
    expect(() =>
      assertSupportedRuntime({ nodeVersion: "22.13.0", npmVersion: "10.9.1" }),
    ).toThrowError(expect.objectContaining({ reason: "database_tooling_runtime_invalid" }));
    expect(() =>
      assertSupportedRuntime({ nodeVersion: "22.13.0", npmVersion: "10.9.2" }),
    ).not.toThrow();
  });
});

describe("database tooling migration state", () => {
  it.each([
    [[], "uninitialized"],
    [["20260101000000"], "behind"],
    [["20260101000000", "20260102000000"], "current"],
    [["20260102000000"], "unknown_history"],
    [["20260101000000", "20260102000000", "20260103000000"], "unknown_history"],
  ])("classifies %j as %s", (remoteVersions, expected) => {
    expect(classifyMigrationHistory(localMigrations, remoteVersions)).toBe(expected);
  });

  it("requires the exact checked-out migration head for read-only fixture operations", () => {
    expect(() => assertEnvironmentCurrent("current")).not.toThrow();
    for (const state of ["uninitialized", "behind", "unknown_history", "schema_drift"]) {
      expect(() => assertEnvironmentCurrent(state)).toThrowError(
        expect.objectContaining({ reason: "supabase_environment_database_not_current" }),
      );
    }
  });

  it("uses only explicit database URL commands during a current preflight", async () => {
    const target = validateEnvironmentTarget("uat", environmentValues("uat"));
    const commands: string[][] = [];
    const output: string[] = [];
    const checkedTypes = readFileSync(join(repositoryRoot, "src/lib/supabase/types.ts"), "utf8");

    const result = await runEnvironmentPreflight(target, {
      localMigrations,
      output: (line: string) => output.push(line),
      readMigrationVersions: vi
        .fn()
        .mockResolvedValue(localMigrations.map(({ version }) => version)),
      readFoundation: vi.fn().mockResolvedValue({ ok: true }),
      runSupabaseCommand: vi.fn((args: string[]) => {
        commands.push(args);
        return args[0] === "gen" ? checkedTypes : "Remote database is up to date.";
      }),
    });

    expect(result.state).toBe("current");
    expect(output.filter((line) => line.startsWith("schema_state="))).toEqual([
      "schema_state=current",
    ]);
    expect(commands).toHaveLength(2);
    expect(commands.every((args) => args.includes("--db-url"))).toBe(true);
    expect(commands.every((args) => !args.includes("--linked"))).toBe(true);
  });

  it("reports schema drift when generated types differ", async () => {
    const target = validateEnvironmentTarget("uat", environmentValues("uat"));
    const result = await runEnvironmentPreflight(target, {
      localMigrations,
      output: vi.fn(),
      readMigrationVersions: vi
        .fn()
        .mockResolvedValue(localMigrations.map(({ version }) => version)),
      readFoundation: vi.fn().mockResolvedValue({ ok: true }),
      runSupabaseCommand: vi.fn((args: string[]) =>
        args[0] === "gen" ? normalizeGeneratedTypes("export type Database = never;") : "",
      ),
    });
    expect(result.state).toBe("schema_drift");
  });

  it("does not run a dry-run against unknown history", async () => {
    const target = validateEnvironmentTarget("uat", environmentValues("uat"));
    const runSupabaseCommand = vi.fn();
    const result = await runEnvironmentPreflight(target, {
      localMigrations,
      output: vi.fn(),
      readMigrationVersions: vi.fn().mockResolvedValue(["19990101000000"]),
      runSupabaseCommand,
    });
    expect(result.state).toBe("unknown_history");
    expect(runSupabaseCommand).not.toHaveBeenCalled();
  });

  it("checks confirmation before reading or writing a remote target", async () => {
    const target = validateEnvironmentTarget("uat", environmentValues("uat"));
    const preflight = vi.fn();
    await expect(
      runEnvironmentMigration(target, DEPLOYED_PROJECTS.production, { preflight }),
    ).rejects.toMatchObject({ reason: "supabase_migration_confirmation_mismatch" });
    expect(preflight).not.toHaveBeenCalled();
  });

  it("applies a behind target once and verifies it is current", async () => {
    const target = validateEnvironmentTarget("uat", environmentValues("uat"));
    const preflight = vi
      .fn()
      .mockResolvedValueOnce({ state: "behind" })
      .mockResolvedValueOnce({ state: "current" });
    const runSupabaseCommand = vi.fn();

    await runEnvironmentMigration(target, target.projectRef, {
      preflight,
      runSupabaseCommand,
    });

    expect(preflight).toHaveBeenCalledTimes(2);
    expect(runSupabaseCommand).toHaveBeenCalledWith(
      ["db", "push", "--db-url", target.databaseUrl, "--yes"],
      expect.objectContaining({ reason: "supabase_migration_failed" }),
    );
  });
});

describe("database tooling error safety", () => {
  it("redacts database URLs, query strings, and API keys", () => {
    const text = redactSensitiveText(
      "postgresql://postgres:password@db.example.com/postgres https://example.test/path?token=value sb_secret_private",
    );
    expect(text).not.toContain("password");
    expect(text).not.toContain("token=value");
    expect(text).not.toContain("sb_secret_private");
  });

  it("uses stable typed errors", () => {
    expect(new DatabaseToolingError("stable_reason")).toMatchObject({
      name: "DatabaseToolingError",
      reason: "stable_reason",
    });
  });
});
