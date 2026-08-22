import { describe, expect, it } from "vitest";

import { readProductActivationConfig } from "./product-activation.config";

const environment = {
  BAZORIA_DEPLOYMENT_ENVIRONMENT: "local",
  BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "local",
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

  it("requires and normalizes the deployed Cloud Tasks configuration", () => {
    expect(readProductActivationConfig(cloudEnvironment())).toMatchObject({
      deploymentEnvironment: "uat",
      dispatchMode: "cloud_tasks",
      googleCloudProject: "bazoria-uat",
      taskLocation: "europe-west1",
      taskQueue: "product-activation",
      workerUrl: "https://activation.example.com",
      taskServiceAccount: "task-caller@bazoria-uat.iam.gserviceaccount.com",
      taskAudience: "https://activation.example.com/",
      taskDispatchDeadlineSeconds: 270,
      taskClientTimeoutMs: 10_000,
      taskMaximumRetryDurationSeconds: 420,
      maximumEnqueueAttemptMs: 45_000,
    });
  });

  it("rejects a task deadline that cannot contain the worker deadline", () => {
    expect(() =>
      readProductActivationConfig({
        ...cloudEnvironment(),
        BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS: "269",
      }),
    ).toThrow(/TASK_DISPATCH_DEADLINE_SECONDS.*at least 270/);
  });

  it("rejects queue retries that cannot outlive an activation claim", () => {
    expect(() =>
      readProductActivationConfig({
        ...cloudEnvironment(),
        BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS: "419",
      }),
    ).toThrow(/TASK_MAX_RETRY_DURATION_SECONDS.*at least 420/);
  });

  it("does not require local recovery configuration in cloud mode", () => {
    const config = readProductActivationConfig({
      ...cloudEnvironment(),
      BAZORIA_PRODUCT_ACTIVATION_RECOVERY_BATCH_SIZE: "999",
    });
    expect(config.dispatchMode).toBe("cloud_tasks");
    expect(config).not.toHaveProperty("recoveryBatchSize");
  });
});

function cloudEnvironment() {
  return {
    ...environment,
    BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
    BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "cloud_tasks",
    GOOGLE_CLOUD_PROJECT: "bazoria-uat",
    BAZORIA_PRODUCT_PUBLICATION_TASK_LOCATION: "europe-west1",
    BAZORIA_PRODUCT_PUBLICATION_TASK_QUEUE: "product-activation",
    BAZORIA_PRODUCT_PUBLICATION_WORKER_URL: "https://activation.example.com///",
    BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT:
      "task-caller@bazoria-uat.iam.gserviceaccount.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: "https://activation.example.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS: "270",
    BAZORIA_PRODUCT_PUBLICATION_TASK_CLIENT_TIMEOUT_SECONDS: "10",
    BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS: "420",
  };
}
