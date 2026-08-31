import { describe, expect, it } from "vitest";

import { readProductActivationConfig } from "@/features/admin/server/product-activation.config";
import { readProductActivationReconciliationConfig } from "@/features/admin/server/product-activation-reconciliation.config";
import { readProductActivationWorkerConfig } from "@/features/admin/server/product-activation.worker-config";
import { readRuntimePublicConfig } from "@/lib/runtime-public-config.server";

describe("runtime role configuration isolation", () => {
  it("validates the web role without worker-only port settings", () => {
    const environment = cloudEnvironment();
    delete environment.PORT;

    expect(readRuntimePublicConfig(environment).environment).toBe("uat");
    expect(readProductActivationConfig(environment).dispatchMode).toBe("cloud_tasks");
  });

  it("validates the worker without browser or Cloud Tasks queue settings", () => {
    const environment = workerEnvironment();

    expect(readProductActivationWorkerConfig(environment).port).toBe(8080);
    expect(environment.SUPABASE_PUBLISHABLE_KEY).toBeUndefined();
    expect(environment.BAZORIA_PRODUCT_PUBLICATION_TASK_QUEUE).toBeUndefined();
  });

  it("validates reconciliation without worker listener settings", () => {
    const environment = cloudEnvironment();
    delete environment.PORT;

    expect(readProductActivationReconciliationConfig(environment).reconciliationBatchSize).toBe(
      100,
    );
  });
});

function baseEnvironment(): Record<string, string | undefined> {
  return {
    BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
    BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "cloud_tasks",
    BAZORIA_PRODUCT_PUBLICATION_MAXIMUM_IMAGE_COUNT: "20",
    BAZORIA_PRODUCT_PUBLICATION_ITEM_CONCURRENCY: "3",
    BAZORIA_PRODUCT_PUBLICATION_ITEM_TIMEOUT_SECONDS: "30",
    BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS: "240",
    BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS: "360",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  };
}

function cloudEnvironment(): Record<string, string | undefined> {
  return {
    ...baseEnvironment(),
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser-key",
    BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: "false",
    GOOGLE_CLOUD_PROJECT: "bazoria-uat",
    BAZORIA_PRODUCT_PUBLICATION_TASK_LOCATION: "europe-west3",
    BAZORIA_PRODUCT_PUBLICATION_TASK_QUEUE: "product-activation",
    BAZORIA_PRODUCT_PUBLICATION_WORKER_URL: "https://worker.example.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT: "task@example.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: "https://worker.example.com/",
    BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS: "270",
    BAZORIA_PRODUCT_PUBLICATION_TASK_CLIENT_TIMEOUT_SECONDS: "10",
    BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS: "420",
    BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_BATCH_SIZE: "100",
    BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_DEADLINE_SECONDS: "60",
  };
}

function workerEnvironment(): Record<string, string | undefined> {
  return {
    ...baseEnvironment(),
    BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: "https://worker.example.com/",
    BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT: "task@example.com",
    PORT: "8080",
  };
}
