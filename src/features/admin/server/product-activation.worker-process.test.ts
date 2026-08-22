import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PRODUCT_ACTIVATION_SHUTDOWN_DRAIN_MS,
  startProductActivationWorkerProcess,
  type ProductActivationWorkerProcess,
} from "./product-activation.worker-process";
import { ProductActivationWorkerService } from "./product-activation.worker-service";
import type { ProductActivationWorkerConfig } from "./product-activation.worker-config";

let workerProcess: ProductActivationWorkerProcess | undefined;

afterEach(async () => {
  await workerProcess?.shutdown();
  workerProcess = undefined;
});

describe("product activation worker process", () => {
  it("binds independently and serves only empty health and task responses", async () => {
    const service = serviceFixture();
    workerProcess = await startProductActivationWorkerProcess({ config: config(), service });

    const baseUrl = `http://127.0.0.1:${workerProcess.port}`;
    const health = await fetch(`${baseUrl}/health`);
    const missing = await fetch(`${baseUrl}/browser-route`);
    const invalidMethod = await fetch(`${baseUrl}/health`, { method: "POST" });

    expect(health.status).toBe(204);
    expect(await health.text()).toBe("");
    expect(missing.status).toBe(404);
    expect(invalidMethod.status).toBe(405);
    expect(invalidMethod.headers.get("allow")).toBe("GET");
  });

  it("accepts a valid authenticated task and returns no response body", async () => {
    workerProcess = await startProductActivationWorkerProcess({
      config: config(),
      service: serviceFixture(),
    });
    const response = await fetch(
      `http://127.0.0.1:${workerProcess.port}/internal/tasks/activate-product-submission`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer signed-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runId: "00000000-0000-4000-8000-000000000001",
          dispatchGeneration: 1,
        }),
      },
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("uses a fixed nine-second shutdown drain contract", () => {
    expect(PRODUCT_ACTIVATION_SHUTDOWN_DRAIN_MS).toBe(9_000);
  });

  it("ends the process drain after nine seconds when an active task does not finish", async () => {
    let workerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      workerStarted = resolve;
    });
    workerProcess = await startProductActivationWorkerProcess({
      config: config(),
      service: serviceFixture(
        vi.fn(async () => {
          workerStarted();
          return new Promise(() => undefined);
        }),
      ),
    });
    const taskRequest = fetch(
      `http://127.0.0.1:${workerProcess.port}/internal/tasks/activate-product-submission`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer signed-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runId: "00000000-0000-4000-8000-000000000001",
          dispatchGeneration: 1,
        }),
      },
    ).catch(() => undefined);
    await started;

    vi.useFakeTimers();
    try {
      let drained = false;
      const shutdown = workerProcess.shutdown().then(() => {
        drained = true;
      });
      await vi.advanceTimersByTimeAsync(PRODUCT_ACTIVATION_SHUTDOWN_DRAIN_MS - 1);
      expect(drained).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await shutdown;
      expect(drained).toBe(true);
      await taskRequest;
    } finally {
      vi.useRealTimers();
    }
  });
});

function serviceFixture(
  run = vi.fn(async (payload) => ({ status: "completed" as const, ...payload })),
): ProductActivationWorkerService {
  return new ProductActivationWorkerService({
    identityVerifier: { verify: vi.fn(async () => ({ email: "task@example.com" })) },
    expectedServiceAccount: "task@example.com",
    getRepository: vi.fn(async () => ({
      recordDispatchResult: vi.fn(async (input) => ({
        result: "recorded" as const,
        runId: input.runId,
        dispatchGeneration: input.dispatchGeneration,
        dispatchStatus: "dispatched" as const,
        dispatchRequired: false,
      })),
    })),
    createWorker: vi.fn(async () => ({
      run,
    })),
    log: vi.fn(),
  });
}

function config(): ProductActivationWorkerConfig {
  return {
    deploymentEnvironment: "local",
    maximumImageCount: 20,
    itemConcurrency: 3,
    itemTimeoutMs: 30_000,
    workerDeadlineMs: 240_000,
    claimTimeoutSeconds: 360,
    supabaseUrl: "https://database.example.com",
    serviceRoleKey: "secret",
    taskAudience: "https://activation.example.com/",
    taskServiceAccount: "task@example.com",
    port: 0,
  };
}
