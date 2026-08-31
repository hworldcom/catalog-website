import { describe, expect, it } from "vitest";

import { handleGetHealth, handleGetVersion } from "./runtime-probes.http";

describe("runtime probes", () => {
  it("serves database-free health without a response body", async () => {
    const response = handleGetHealth();
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  it("serves non-secret build identity", async () => {
    const response = handleGetVersion({
      BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
      BAZORIA_RELEASE_COMMIT: "abcdef1234",
      BAZORIA_BUILD_ID: "build-42",
      K_REVISION: "bazoria-web-00042",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
    });

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      releaseCommit: "abcdef1234",
      buildId: "build-42",
    });
  });
});
