import { status as grpcStatus } from "@grpc/grpc-js";
import { describe, expect, it, vi } from "vitest";

import type { CloudTasksProductActivationSettings } from "./product-activation.config";
import {
  CloudTasksProductActivationDispatcher,
  GoogleCloudProductActivationTaskClient,
  productActivationTaskId,
  type GoogleCloudTasksApi,
  type ProductActivationTaskClient,
  type ProductActivationTaskCreateResult,
  type ProductActivationTaskLookupResult,
} from "./product-activation.cloud-tasks";
import type { ProductActivationRepository } from "./product-activation.repository";
import type {
  ProductActivationDispatchPayload,
  ProductActivationDispatchResult,
} from "./product-activation.types";

const payload = { runId: uuid(1), dispatchGeneration: 3 };

describe("GoogleCloudProductActivationTaskClient", () => {
  it("creates the deterministic authenticated task with only the fenced payload", async () => {
    const api = apiFixture();
    const tasks = new GoogleCloudProductActivationTaskClient(cloudConfig(), api);

    await expect(tasks.create(payload)).resolves.toBe("created");

    expect(api.createTask).toHaveBeenCalledWith(
      {
        parent: "projects/bazoria-uat/locations/europe-west1/queues/product-activation",
        task: {
          name:
            "projects/bazoria-uat/locations/europe-west1/queues/product-activation/tasks/" +
            productActivationTaskId(payload),
          dispatchDeadline: { seconds: 270 },
          httpRequest: {
            httpMethod: 1,
            url: "https://activation.example.com/internal/tasks/activate-product-submission",
            headers: { "Content-Type": "application/json" },
            body: expect.any(Buffer),
            oidcToken: {
              serviceAccountEmail: "task-caller@bazoria-uat.iam.gserviceaccount.com",
              audience: "https://activation.example.com",
            },
          },
        },
      },
      { timeout: 10_000 },
    );
    const request = vi.mocked(api.createTask).mock.calls[0]![0];
    expect(
      JSON.parse(Buffer.from(request.task!.httpRequest!.body as Uint8Array).toString("utf8")),
    ).toEqual(payload);
  });

  it.each([
    [grpcStatus.ALREADY_EXISTS, "already_exists"],
    [grpcStatus.DEADLINE_EXCEEDED, "ambiguous"],
    [grpcStatus.UNAVAILABLE, "ambiguous"],
    [grpcStatus.PERMISSION_DENIED, "definitive_failure"],
    [grpcStatus.INVALID_ARGUMENT, "definitive_failure"],
  ] as const)("maps create status %s to %s", async (code, expected) => {
    const api = apiFixture({ createTask: rejecting(code) });
    await expect(
      new GoogleCloudProductActivationTaskClient(cloudConfig(), api).create(payload),
    ).resolves.toBe(expected);
  });

  it.each([
    [grpcStatus.NOT_FOUND, "absent"],
    [grpcStatus.UNAVAILABLE, "unknown"],
    [grpcStatus.PERMISSION_DENIED, "unknown"],
  ] as const)("maps lookup status %s to %s", async (code, expected) => {
    const api = apiFixture({ getTask: rejecting(code) });
    await expect(
      new GoogleCloudProductActivationTaskClient(cloudConfig(), api).lookup(payload),
    ).resolves.toBe(expected);
  });
});

describe("CloudTasksProductActivationDispatcher", () => {
  it.each(["created", "already_exists"] as const)(
    "records %s as a confirmed dispatch without a lookup",
    async (createResult) => {
      const { dispatcher, repository, tasks } = dispatcherFixture([createResult]);

      await expect(dispatcher.dispatchWithOutcome(payload)).resolves.toMatchObject({
        durableResult: { dispatchStatus: "dispatched" },
        taskOutcome: createResult,
      });
      expect(repository.recordDispatchResult).toHaveBeenCalledWith({
        ...payload,
        result: "dispatched",
      });
      expect(tasks.lookup).not.toHaveBeenCalled();
    },
  );

  it("confirms an ambiguous create through exact-name lookup", async () => {
    const { dispatcher, repository, tasks } = dispatcherFixture(["ambiguous"], ["exists"]);

    await expect(dispatcher.dispatchWithOutcome(payload)).resolves.toMatchObject({
      taskOutcome: "found_after_ambiguous_create",
    });

    expect(tasks.lookup).toHaveBeenCalledTimes(1);
    expect(repository.recordDispatchResult).toHaveBeenCalledWith({
      ...payload,
      result: "dispatched",
    });
  });

  it("makes one same-name retry after definitive absence", async () => {
    const { dispatcher, repository, tasks } = dispatcherFixture(
      ["ambiguous", "already_exists"],
      ["absent"],
    );

    await dispatcher.dispatch(payload);

    expect(tasks.create).toHaveBeenCalledTimes(2);
    expect(repository.recordDispatchResult).toHaveBeenCalledWith({
      ...payload,
      result: "dispatched",
    });
  });

  it("records failure when the repeated ambiguous create is definitively absent", async () => {
    const { dispatcher, repository, tasks } = dispatcherFixture(
      ["ambiguous", "ambiguous"],
      ["absent", "absent"],
    );

    await expect(dispatcher.dispatch(payload)).resolves.toMatchObject({ dispatchStatus: "failed" });
    expect(tasks.create).toHaveBeenCalledTimes(2);
    expect(tasks.lookup).toHaveBeenCalledTimes(2);
    expect(repository.recordDispatchResult).toHaveBeenCalledWith({ ...payload, result: "failed" });
  });

  it("records a definitive initial create failure without retrying", async () => {
    const { dispatcher, repository, tasks } = dispatcherFixture(["definitive_failure"]);

    await dispatcher.dispatch(payload);

    expect(tasks.create).toHaveBeenCalledTimes(1);
    expect(tasks.lookup).not.toHaveBeenCalled();
    expect(repository.recordDispatchResult).toHaveBeenCalledWith({ ...payload, result: "failed" });
  });

  it("leaves dispatch pending when task existence remains unknown", async () => {
    const { dispatcher, repository, tasks } = dispatcherFixture(["ambiguous"], ["unknown"]);

    await expect(dispatcher.dispatch(payload)).rejects.toMatchObject({
      statusCode: 503,
      code: "product_moderation_activation_unavailable",
    });
    expect(tasks.create).toHaveBeenCalledTimes(1);
    expect(repository.recordDispatchResult).not.toHaveBeenCalled();
  });

  it("bounds the complete enqueue attempt and leaves dispatch pending", async () => {
    vi.useFakeTimers();
    try {
      const repository = {
        recordDispatchResult: vi.fn(),
      } satisfies Pick<ProductActivationRepository, "recordDispatchResult">;
      const tasks = {
        create: vi.fn(() => new Promise<ProductActivationTaskCreateResult>(() => undefined)),
        lookup: vi.fn(),
      } satisfies ProductActivationTaskClient;
      const dispatcher = new CloudTasksProductActivationDispatcher(repository, tasks, 1_000);

      const result = dispatcher.dispatch(payload);
      const rejection = expect(result).rejects.toMatchObject({
        statusCode: 503,
        code: "product_moderation_activation_unavailable",
      });
      await vi.advanceTimersByTimeAsync(1_000);

      await rejection;
      expect(repository.recordDispatchResult).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops after an external abort and ignores a late task result", async () => {
    let resolveCreate: (result: ProductActivationTaskCreateResult) => void = () => undefined;
    const repository = {
      recordDispatchResult: vi.fn(),
    } satisfies Pick<ProductActivationRepository, "recordDispatchResult">;
    const tasks = {
      create: vi.fn(
        () =>
          new Promise<ProductActivationTaskCreateResult>((resolve) => {
            resolveCreate = resolve;
          }),
      ),
      lookup: vi.fn(),
    } satisfies ProductActivationTaskClient;
    const dispatcher = new CloudTasksProductActivationDispatcher(repository, tasks, 45_000);
    const deadline = new AbortController();

    const result = dispatcher.dispatchWithOutcome(payload, { signal: deadline.signal });
    deadline.abort();
    await expect(result).rejects.toMatchObject({
      statusCode: 503,
      code: "product_moderation_activation_unavailable",
    });

    resolveCreate("created");
    await Promise.resolve();
    await Promise.resolve();
    expect(tasks.lookup).not.toHaveBeenCalled();
    expect(repository.recordDispatchResult).not.toHaveBeenCalled();
  });

  it("does not start a task operation when the external deadline already expired", async () => {
    const { dispatcher, repository, tasks } = dispatcherFixture(["created"]);
    const deadline = new AbortController();
    deadline.abort();

    await expect(
      dispatcher.dispatchWithOutcome(payload, { signal: deadline.signal }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "product_moderation_activation_unavailable",
    });
    expect(tasks.create).not.toHaveBeenCalled();
    expect(repository.recordDispatchResult).not.toHaveBeenCalled();
  });

  it("rejects an invalid internal payload before calling Cloud Tasks", async () => {
    const { dispatcher, tasks } = dispatcherFixture(["created"]);

    await expect(
      dispatcher.dispatch({ runId: "not-a-uuid", dispatchGeneration: 0 }),
    ).rejects.toMatchObject({ statusCode: 400, code: "product_activation_dispatch_invalid" });
    expect(tasks.create).not.toHaveBeenCalled();
  });
});

function apiFixture(overrides: Partial<GoogleCloudTasksApi> = {}): GoogleCloudTasksApi {
  return {
    queuePath: vi.fn(
      (project, location, queue) => `projects/${project}/locations/${location}/queues/${queue}`,
    ),
    taskPath: vi.fn(
      (project, location, queue, task) =>
        `projects/${project}/locations/${location}/queues/${queue}/tasks/${task}`,
    ),
    createTask: vi.fn(async () => []),
    getTask: vi.fn(async () => []),
    ...overrides,
  };
}

function rejecting(code: number) {
  return vi.fn(async () => {
    throw Object.assign(new Error("Google Cloud Tasks request failed."), { code });
  });
}

function dispatcherFixture(
  createResults: ProductActivationTaskCreateResult[],
  lookupResults: ProductActivationTaskLookupResult[] = [],
) {
  const repository = {
    recordDispatchResult: vi.fn(async (input) => dispatchResult(input.result)),
  } satisfies Pick<ProductActivationRepository, "recordDispatchResult">;
  const tasks = {
    create: vi.fn(async () => createResults.shift()!),
    lookup: vi.fn(async () => lookupResults.shift()!),
  } satisfies ProductActivationTaskClient;
  return {
    repository,
    tasks,
    dispatcher: new CloudTasksProductActivationDispatcher(repository, tasks, 45_000),
  };
}

function dispatchResult(result: "dispatched" | "failed"): ProductActivationDispatchResult {
  return {
    result: "recorded",
    ...payload,
    dispatchStatus: result,
    dispatchRequired: false,
  };
}

function cloudConfig(): CloudTasksProductActivationSettings {
  return {
    deploymentEnvironment: "uat",
    dispatchMode: "cloud_tasks",
    googleCloudProject: "bazoria-uat",
    taskLocation: "europe-west1",
    taskQueue: "product-activation",
    workerUrl: "https://activation.example.com",
    taskServiceAccount: "task-caller@bazoria-uat.iam.gserviceaccount.com",
    taskAudience: "https://activation.example.com",
    taskDispatchDeadlineSeconds: 270,
    taskClientTimeoutMs: 10_000,
    taskMaximumRetryDurationSeconds: 420,
    maximumEnqueueAttemptMs: 45_000,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
