import { readFile, writeFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import { readProductDataResetConfig } from "./product-data-reset.config";
import {
  ProductDataResetFailure,
  ProductDataResetService,
  type PreservedIdentitySnapshot,
  type ProductDataResetSummary,
} from "./product-data-reset.service";
import { SupabaseProductDataResetGateway } from "./supabase-product-data-reset.gateway";

async function main(): Promise<void> {
  let summaryPath: string | undefined;
  try {
    const config = readProductDataResetConfig();
    summaryPath = config.summaryPath;
    const database = createClient<Database>(config.supabaseUrl, config.serviceRoleKey, {
      global: { fetch: serviceKeyFetch(config.serviceRoleKey) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = new ProductDataResetService(
      new SupabaseProductDataResetGateway(database),
      config.projectRef,
      config.qaUserIds,
      config.pageSize,
    );

    let summary: ProductDataResetSummary;
    if (config.mode === "prepare") {
      const snapshot = await service.captureSnapshot();
      await writeJson(config.snapshotPath, snapshot, true);
      summary = await service.cleanStorage();
    } else {
      const snapshot = JSON.parse(
        await readFile(config.snapshotPath, "utf8"),
      ) as PreservedIdentitySnapshot;
      summary = await service.verifySnapshot(snapshot);
    }
    await writeJson(config.summaryPath, summary, false);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    const summary =
      error instanceof ProductDataResetFailure
        ? error.summary
        : {
            status: "failed",
            errorCode: error instanceof Error ? error.message : "product_data_reset_failed",
          };
    if (summaryPath) await writeJson(summaryPath, summary, false).catch(() => undefined);
    process.stderr.write(`${JSON.stringify(summary)}\n`);
    process.exitCode = 1;
  }
}

async function writeJson(path: string, value: unknown, exclusive: boolean): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: exclusive ? "wx" : "w",
  });
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
