import { describe, expect, it, vi } from "vitest";

import type { ProductActivationTaskClient } from "./product-activation.cloud-tasks";
import { CloudTasksProductActivationDispatcher } from "./product-activation.cloud-tasks";
import { LocalProductActivationDispatcher } from "./product-activation.dispatcher";
import type { ProductActivationRepository } from "./product-activation.repository";
import { createProductActivationRuntime } from "./product-activation.runtime";
import type { ProductPublicationStorage } from "@/features/seller/server/product-publication.storage";

describe("createProductActivationRuntime", () => {
  it("constructs only the local dispatcher and storage in a local environment", async () => {
    const createStorage = vi.fn(() => ({}) as ProductPublicationStorage);
    const createTaskClient = vi.fn();

    const runtime = await createProductActivationRuntime({
      environment: localEnvironment(),
      createRepository: async () => repositoryFixture(),
      createStorage,
      createTaskClient,
    });

    expect(runtime.dispatcher).toBeInstanceOf(LocalProductActivationDispatcher);
    expect(createStorage).toHaveBeenCalledTimes(1);
    expect(createTaskClient).not.toHaveBeenCalled();
  });

  it("constructs only the Cloud Tasks dispatcher and never starts local recovery", async () => {
    const repository = repositoryFixture();
    const createStorage = vi.fn();
    const taskClient = taskClientFixture();
    const createTaskClient = vi.fn(() => taskClient);

    const runtime = await createProductActivationRuntime({
      environment: cloudEnvironment(),
      createRepository: async () => repository,
      createStorage,
      createTaskClient,
    });
    runtime.startRecovery();

    expect(runtime.dispatcher).toBeInstanceOf(CloudTasksProductActivationDispatcher);
    expect(createTaskClient).toHaveBeenCalledTimes(1);
    expect(createStorage).not.toHaveBeenCalled();
    expect(repository.listRecoverableDispatches).not.toHaveBeenCalled();
  });
});

function repositoryFixture(): ProductActivationRepository {
  return {
    listRecoverableDispatches: vi.fn(async () => []),
  } as unknown as ProductActivationRepository;
}

function taskClientFixture(): ProductActivationTaskClient {
  return {
    create: vi.fn<ProductActivationTaskClient["create"]>(async () => "created"),
    lookup: vi.fn<ProductActivationTaskClient["lookup"]>(async () => "exists"),
  };
}

function localEnvironment() {
  return {
    BAZORIA_DEPLOYMENT_ENVIRONMENT: "local",
    BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "local",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  };
}

function cloudEnvironment() {
  return {
    ...localEnvironment(),
    BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
    BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "cloud_tasks",
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
