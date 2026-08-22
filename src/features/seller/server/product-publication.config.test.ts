import { describe, expect, it } from "vitest";

import { readProductPublicationConfig } from "./product-publication.config";

const validEnvironment = {
  BAZORIA_DEPLOYMENT_ENVIRONMENT: "local",
  BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "local",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
};

describe("readProductPublicationConfig", () => {
  it("uses the bounded prototype defaults", () => {
    expect(readProductPublicationConfig(validEnvironment)).toEqual({
      deploymentEnvironment: "local",
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

  it("rejects local dispatch in a deployed Bazoria environment", () => {
    expect(() =>
      readProductPublicationConfig({
        ...validEnvironment,
        BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
      }),
    ).toThrow(/product_publication_configuration_invalid.*must be cloud_tasks for uat/);
  });

  it("does not use NODE_ENV as the Bazoria environment identity", () => {
    expect(
      readProductPublicationConfig({ ...validEnvironment, NODE_ENV: "production" }),
    ).toMatchObject({ deploymentEnvironment: "local", dispatchMode: "local" });
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
