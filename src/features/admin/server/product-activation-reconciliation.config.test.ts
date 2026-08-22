import { describe, expect, it } from "vitest";

import { readProductActivationReconciliationConfig } from "./product-activation-reconciliation.config";

describe("readProductActivationReconciliationConfig", () => {
  it("adds bounded reconciliation defaults to deployed Cloud Tasks configuration", () => {
    expect(readProductActivationReconciliationConfig(cloudEnvironment())).toMatchObject({
      dispatchMode: "cloud_tasks",
      reconciliationBatchSize: 100,
      reconciliationDeadlineMs: 60_000,
      maximumEnqueueAttemptMs: 45_000,
    });
  });

  it.each([
    ["BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_BATCH_SIZE", "0"],
    ["BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_BATCH_SIZE", "501"],
    ["BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_DEADLINE_SECONDS", "9"],
    ["BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_DEADLINE_SECONDS", "301"],
  ])("rejects invalid reconciliation setting %s=%s", (name, value) => {
    expect(() =>
      readProductActivationReconciliationConfig({
        ...cloudEnvironment(),
        [name]: value,
      }),
    ).toThrow(/product_publication_configuration_invalid/);
  });

  it("requires enough command time for one complete enqueue attempt plus margin", () => {
    expect(() =>
      readProductActivationReconciliationConfig({
        ...cloudEnvironment(),
        BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_DEADLINE_SECONDS: "49",
      }),
    ).toThrow(/RECONCILIATION_DEADLINE_SECONDS.*at least 50/);
  });

  it("cannot run with the local in-process dispatcher", () => {
    expect(() =>
      readProductActivationReconciliationConfig({
        BAZORIA_DEPLOYMENT_ENVIRONMENT: "local",
        BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "local",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      }),
    ).toThrow(/product_publication_configuration_invalid.*cloud_tasks/);
  });
});

function cloudEnvironment() {
  return {
    BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
    BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "cloud_tasks",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
    GOOGLE_CLOUD_PROJECT: "bazoria-uat",
    BAZORIA_PRODUCT_PUBLICATION_TASK_LOCATION: "europe-west1",
    BAZORIA_PRODUCT_PUBLICATION_TASK_QUEUE: "product-activation",
    BAZORIA_PRODUCT_PUBLICATION_WORKER_URL: "https://activation.example.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT:
      "task-caller@bazoria-uat.iam.gserviceaccount.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: "https://activation.example.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS: "270",
    BAZORIA_PRODUCT_PUBLICATION_TASK_CLIENT_TIMEOUT_SECONDS: "10",
    BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS: "420",
  };
}
