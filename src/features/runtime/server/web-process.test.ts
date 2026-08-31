import { describe, expect, it, vi } from "vitest";

import { startWebProcess } from "./web-process";

describe("web process", () => {
  it("validates its configuration before importing the Nitro listener", async () => {
    const importServer = vi.fn(async () => undefined);
    await expect(
      startWebProcess({
        environment: { BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat" },
        importServer,
      }),
    ).rejects.toThrow("runtime_public_configuration_invalid");
    expect(importServer).not.toHaveBeenCalled();
  });

  it("imports only the web listener after web-role settings are valid", async () => {
    const importServer = vi.fn(async () => undefined);
    await startWebProcess({ environment: environment(), importServer });
    expect(importServer).toHaveBeenCalledTimes(1);
  });
});

function environment(): Record<string, string | undefined> {
  return {
    BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
    BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: "false",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "cloud_tasks",
    GOOGLE_CLOUD_PROJECT: "bazoria-uat",
    BAZORIA_PRODUCT_PUBLICATION_TASK_LOCATION: "europe-west3",
    BAZORIA_PRODUCT_PUBLICATION_TASK_QUEUE: "product-activation",
    BAZORIA_PRODUCT_PUBLICATION_WORKER_URL: "https://worker.example.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT: "task@example.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: "https://worker.example.com/",
    BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS: "270",
    BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS: "420",
  };
}
