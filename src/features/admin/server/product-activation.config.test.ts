import { describe, expect, it } from "vitest";

import { readProductActivationConfig } from "./product-activation.config";

const environment = {
  BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "local",
  NODE_ENV: "development",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
};

describe("readProductActivationConfig", () => {
  it("adds bounded local recovery defaults to the publication worker limits", () => {
    expect(readProductActivationConfig(environment)).toMatchObject({
      maximumImageCount: 20,
      claimTimeoutSeconds: 360,
      recoveryIntervalMs: 30_000,
      recoveryBatchSize: 25,
    });
  });

  it("rejects an unbounded recovery batch", () => {
    expect(() =>
      readProductActivationConfig({
        ...environment,
        BAZORIA_PRODUCT_ACTIVATION_RECOVERY_BATCH_SIZE: "101",
      }),
    ).toThrow(/product_activation_configuration_invalid/);
  });
});
