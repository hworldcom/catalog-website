import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

import type { Database } from "@/lib/supabase/types";

import { readUatMarketplaceFixtureConfig } from "./uat-marketplace-fixtures.config";
import { UatMarketplaceFixtureService } from "./uat-marketplace-fixtures.service";
import { SupabaseUatMarketplaceFixtureGateway } from "./supabase-uat-marketplace-fixtures.gateway";

async function main(): Promise<void> {
  let sql: ReturnType<typeof postgres> | undefined;
  try {
    const config = readUatMarketplaceFixtureConfig();
    const database = createClient<Database>(config.supabaseUrl, config.serviceRoleKey, {
      global: { fetch: serviceKeyFetch(config.serviceRoleKey) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    sql = postgres(config.databaseUrl, {
      max: 1,
      prepare: false,
      ssl: "require",
    });
    const service = new UatMarketplaceFixtureService(
      new SupabaseUatMarketplaceFixtureGateway(
        database,
        sql,
        config.supabaseUrl,
        config.serviceRoleKey,
        config.administratorUserId,
        config.administratorUserIds,
      ),
    );

    const summary =
      config.mode === "reset"
        ? await service.reset(config.administratorUserIds)
        : config.mode === "seed"
          ? await service.seed({
              assetDirectory: config.assetDirectory,
              password: config.fixtureUserPassword,
            })
          : await service.verify(config.assetDirectory);
    const serializedSummary = `${JSON.stringify(summary, null, 2)}\n`;
    const resultPath = process.env.BAZORIA_UAT_FIXTURE_RESULT_PATH?.trim();
    if (resultPath) {
      const absoluteResultPath = resolve(resultPath);
      await mkdir(dirname(absoluteResultPath), { recursive: true });
      await writeFile(absoluteResultPath, serializedSummary, { mode: 0o600 });
    }
    process.stdout.write(serializedSummary);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        errorCode: error instanceof Error ? error.message : "uat_marketplace_fixture_failed",
      })}\n`,
    );
    process.exitCode = 1;
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
}

function serviceKeyFetch(serviceRoleKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (
      (serviceRoleKey.startsWith("sb_secret_") || serviceRoleKey.startsWith("sb_publishable_")) &&
      headers.get("Authorization") === `Bearer ${serviceRoleKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", serviceRoleKey);
    return fetch(input, { ...init, headers });
  };
}

void main();
