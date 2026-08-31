import { describe, expect, it } from "vitest";

import { handleGetRuntimePublicConfig } from "./runtime-public-config.http";

describe("runtime public configuration endpoint", () => {
  it("returns only browser-safe values without caching", async () => {
    const response = handleGetRuntimePublicConfig({
      environment: "uat",
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "sb_publishable_browser-key",
      classifierAssistedUploadEnabled: false,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      environment: "uat",
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "sb_publishable_browser-key",
      classifierAssistedUploadEnabled: false,
    });
  });
});
