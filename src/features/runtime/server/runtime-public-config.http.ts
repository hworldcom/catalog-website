import type { RuntimePublicConfig } from "@/lib/runtime-public-config";
import { readRuntimePublicConfig } from "@/lib/runtime-public-config.server";

export function handleGetRuntimePublicConfig(
  config: RuntimePublicConfig = readRuntimePublicConfig(),
): Response {
  return Response.json(config, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
