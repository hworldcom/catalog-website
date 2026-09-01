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
      ),
    );

    const summary =
      config.mode === "reset"
        ? await service.reset([config.administratorUserId])
        : config.mode === "seed"
          ? await service.seed({
              assetDirectory: config.assetDirectory,
              password: config.fixtureUserPassword,
            })
          : await service.verify();
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
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
