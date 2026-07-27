import { describe, expect, it } from "vitest";

import { readProductPublicationConfig } from "./product-publication.config";

const validEnvironment = {
  BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "local",
  NODE_ENV: "development",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
};

describe("readProductPublicationConfig", () => {
  it("uses the bounded prototype defaults", () => {
    expect(readProductPublicationConfig(validEnvironment)).toEqual({
      dispatchMode: "local",
      maximumImageCount: 20,
      itemConcurrency: 3,
      itemTimeoutMs: 30_000,
      workerDeadlineMs: 240_000,
      claimTimeoutSeconds: 360,
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "sb_secret_test",
    });
  });

  it("rejects local dispatch in production", () => {
    expect(() =>
      readProductPublicationConfig({
        ...validEnvironment,
        NODE_ENV: "production",
      }),
    ).toThrow(/product_publication_configuration_invalid.*not allowed in production/);
  });

  it("rejects a worker deadline that cannot contain the bounded image work", () => {
    expect(() =>
      readProductPublicationConfig({
        ...validEnvironment,
        BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS: "239",
      }),
    ).toThrow(/BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS/);
  });

  it("rejects a claim timeout without the reclaim buffer", () => {
    expect(() =>
      readProductPublicationConfig({
        ...validEnvironment,
        BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS: "299",
      }),
    ).toThrow(/BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS/);
  });
});
