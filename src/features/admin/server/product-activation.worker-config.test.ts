import { describe, expect, it } from "vitest";

import { readProductActivationWorkerConfig } from "./product-activation.worker-config";

describe("readProductActivationWorkerConfig", () => {
  it("reads only worker execution, identity, storage, and port settings", () => {
    const config = readProductActivationWorkerConfig(environment());

    expect(config).toMatchObject({
      deploymentEnvironment: "uat",
      maximumImageCount: 20,
      itemConcurrency: 3,
      itemTimeoutMs: 30_000,
      workerDeadlineMs: 240_000,
      claimTimeoutSeconds: 360,
      supabaseUrl: "https://database.example.com",
      serviceRoleKey: "server-secret",
      taskAudience: "https://activation.example.com",
      taskServiceAccount: "task-caller@example.iam.gserviceaccount.com",
      port: 8_080,
    });
  });

  it("does not require dispatcher or task-creation configuration", () => {
    const config = readProductActivationWorkerConfig({
      ...environment(),
      BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: undefined,
      GOOGLE_CLOUD_PROJECT: undefined,
      BAZORIA_PRODUCT_PUBLICATION_TASK_QUEUE: undefined,
      BAZORIA_PRODUCT_PUBLICATION_TASK_LOCATION: undefined,
      BAZORIA_PRODUCT_PUBLICATION_WORKER_URL: undefined,
      BAZORIA_PRODUCT_PUBLICATION_TASK_CLIENT_TIMEOUT_SECONDS: undefined,
      BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS: undefined,
    });

    expect(config.deploymentEnvironment).toBe("uat");
  });

  it("uses port 8080 when PORT is absent", () => {
    expect(readProductActivationWorkerConfig({ ...environment(), PORT: undefined }).port).toBe(
      8_080,
    );
  });

  it.each([
    [{ PORT: "0" }, "PORT"],
    [{ PORT: "65536" }, "PORT"],
    [{ BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: "http://activation.example.com" }, "https"],
    [{ BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS: "200" }, "configured bounded work"],
    [{ BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS: "299" }, "worker deadline"],
  ] as const)("rejects invalid worker settings", (override, expected) => {
    expect(() => readProductActivationWorkerConfig({ ...environment(), ...override })).toThrow(
      expected,
    );
  });
});

function environment(): Record<string, string | undefined> {
  return {
    BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
    BAZORIA_PRODUCT_PUBLICATION_MAXIMUM_IMAGE_COUNT: "20",
    BAZORIA_PRODUCT_PUBLICATION_ITEM_CONCURRENCY: "3",
    BAZORIA_PRODUCT_PUBLICATION_ITEM_TIMEOUT_SECONDS: "30",
    BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS: "240",
    BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS: "360",
    SUPABASE_URL: "https://database.example.com",
    SUPABASE_SERVICE_ROLE_KEY: "server-secret",
    BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: "https://activation.example.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT: "task-caller@example.iam.gserviceaccount.com",
    PORT: "8080",
  };
}
