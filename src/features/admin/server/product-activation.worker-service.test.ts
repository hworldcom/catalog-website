import { describe, expect, it, vi } from "vitest";

import type { TaskIdentityVerifier } from "./product-activation.task-identity";
import type { ProductActivationRepository } from "./product-activation.repository";
import {
  ProductActivationError,
  type ProductActivationDispatchResult,
  type ProductActivationWorkerResult,
} from "./product-activation.types";
import {
  PRODUCT_ACTIVATION_HEALTH_PATH,
  PRODUCT_ACTIVATION_TASK_BODY_LIMIT_BYTES,
  PRODUCT_ACTIVATION_TASK_PATH,
  ProductActivationWorkerService,
  type ProductActivationWorkerLog,
  type ProductActivationWorkerRequest,
} from "./product-activation.worker-service";

const payload = {
  runId: "00000000-0000-4000-8000-000000000001",
  dispatchGeneration: 2,
};

describe("ProductActivationWorkerService routing and identity", () => {
  it("serves readiness and exact method/path responses without database access", async () => {
    const fixture = serviceFixture();

    await expect(
      fixture.service.handle(request("GET", PRODUCT_ACTIVATION_HEALTH_PATH)),
    ).resolves.toEqual({
      statusCode: 204,
    });
    await expect(
      fixture.service.handle(request("POST", PRODUCT_ACTIVATION_HEALTH_PATH)),
    ).resolves.toEqual({
      statusCode: 405,
      headers: { Allow: "GET" },
    });
    await expect(
      fixture.service.handle(request("GET", PRODUCT_ACTIVATION_TASK_PATH)),
    ).resolves.toEqual({
      statusCode: 405,
      headers: { Allow: "POST" },
    });
    await expect(fixture.service.handle(request("GET", "/unknown"))).resolves.toEqual({
      statusCode: 404,
    });
    expect(fixture.getRepository).not.toHaveBeenCalled();
  });

  it("authenticates before reading the body or accessing the database", async () => {
    let bodyRead = false;
    const fixture = serviceFixture({
      identityVerifier: {
        verify: vi.fn(async () => {
          throw new Error("invalid");
        }),
      },
    });

    const result = await fixture.service.handle(
      request("POST", PRODUCT_ACTIVATION_TASK_PATH, {
        authorization: "Bearer bad-token",
        body: (async function* () {
          bodyRead = true;
          yield Buffer.from("not-json");
        })(),
      }),
    );

    expect(result.statusCode).toBe(401);
    expect(bodyRead).toBe(false);
    expect(fixture.getRepository).not.toHaveBeenCalled();
  });

  it.each([
    [null, 401],
    ["Basic abc", 401],
  ] as const)("rejects a missing or malformed bearer identity", async (authorization, status) => {
    const fixture = serviceFixture();
    const response = await fixture.service.handle(
      request("POST", PRODUCT_ACTIVATION_TASK_PATH, { authorization }),
    );
    expect(response.statusCode).toBe(status);
    expect(fixture.identityVerifier.verify).not.toHaveBeenCalled();
  });

  it("returns 403 for a valid unexpected Google service account", async () => {
    const fixture = serviceFixture({
      identityVerifier: { verify: vi.fn(async () => ({ email: "other@example.com" })) },
    });
    expect(
      (await fixture.service.handle(request("POST", PRODUCT_ACTIVATION_TASK_PATH))).statusCode,
    ).toBe(403);
    expect(fixture.getRepository).not.toHaveBeenCalled();
  });
});

describe("ProductActivationWorkerService request validation", () => {
  it.each([
    [{ contentType: null }, "unsupported_content_type"],
    [{ contentType: "text/plain" }, "unsupported_content_type"],
    [
      { contentLength: String(PRODUCT_ACTIVATION_TASK_BODY_LIMIT_BYTES + 1) },
      "declared_body_too_large",
    ],
    [{ contentLength: "not-a-number" }, "invalid_content_length"],
    [{ bodyText: "{" }, "malformed_json"],
    [{ bodyText: JSON.stringify({ ...payload, unexpected: true }) }, "invalid_payload"],
    [{ bodyText: JSON.stringify({ ...payload, dispatchGeneration: 0 }) }, "invalid_payload"],
  ] as const)("acknowledges permanent invalid input: %s", async (options, outcome) => {
    const fixture = serviceFixture();
    const response = await fixture.service.handle(
      request("POST", PRODUCT_ACTIVATION_TASK_PATH, options),
    );
    expect(response.statusCode).toBe(204);
    expect(fixture.getRepository).not.toHaveBeenCalled();
    expect(fixture.logs).toContainEqual(
      expect.objectContaining({
        event: "product_activation_task_invalid",
        outcome,
        errorCode: "product_activation_task_invalid",
      }),
    );
  });

  it("accepts case-insensitive JSON with parameters", async () => {
    const fixture = serviceFixture();
    const response = await fixture.service.handle(
      request("POST", PRODUCT_ACTIVATION_TASK_PATH, {
        contentType: "Application/JSON; charset=utf-8",
      }),
    );
    expect(response.statusCode).toBe(204);
    expect(fixture.worker.run).toHaveBeenCalledWith(payload);
  });

  it("acknowledges a streamed body that crosses the limit", async () => {
    const fixture = serviceFixture();
    const response = await fixture.service.handle(
      request("POST", PRODUCT_ACTIVATION_TASK_PATH, {
        body: chunks(Buffer.alloc(PRODUCT_ACTIVATION_TASK_BODY_LIMIT_BYTES), Buffer.from("x")),
      }),
    );
    expect(response.statusCode).toBe(204);
    expect(fixture.getRepository).not.toHaveBeenCalled();
  });

  it("retries an indeterminate body stream failure", async () => {
    const fixture = serviceFixture();
    const response = await fixture.service.handle(
      request("POST", PRODUCT_ACTIVATION_TASK_PATH, {
        body: failingBody(),
      }),
    );
    expect(response.statusCode).toBe(503);
    expect(fixture.getRepository).not.toHaveBeenCalled();
  });
});

describe("ProductActivationWorkerService dispatch and worker mapping", () => {
  it.each(["recorded", "replay"] as const)(
    "runs the worker after a %s dispatched receipt",
    async (result) => {
      const fixture = serviceFixture({ dispatchResult: dispatchResult(result) });
      expect((await fixture.service.handle(taskRequest())).statusCode).toBe(204);
      expect(fixture.repository.recordDispatchResult).toHaveBeenCalledWith({
        ...payload,
        result: "dispatched",
      });
      expect(fixture.createWorker).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["stale", "retried"] as const)(
    "acknowledges %s dispatch repair as permanent no-work",
    async (result) => {
      const fixture = serviceFixture({
        dispatchResult: dispatchResult(result, result === "stale" ? "pending" : "failed"),
      });
      expect((await fixture.service.handle(taskRequest())).statusCode).toBe(204);
      expect(fixture.createWorker).not.toHaveBeenCalled();
    },
  );

  it.each([
    "product_moderation_not_found",
    "product_moderation_submission_stale",
    "product_activation_dispatch_not_allowed",
    "product_activation_dispatch_invalid",
  ] as const)("acknowledges permanent dispatch error %s", async (code) => {
    const fixture = serviceFixture({
      repositoryError: new ProductActivationError(
        code === "product_moderation_not_found"
          ? 404
          : code === "product_activation_dispatch_invalid"
            ? 400
            : 409,
        code,
        code,
      ),
    });
    expect((await fixture.service.handle(taskRequest())).statusCode).toBe(204);
    expect(fixture.createWorker).not.toHaveBeenCalled();
  });

  it("retries temporary or unclassified dispatch repair failures", async () => {
    const fixture = serviceFixture({ repositoryError: new Error("database unavailable") });
    expect((await fixture.service.handle(taskRequest())).statusCode).toBe(503);
    expect(fixture.createWorker).not.toHaveBeenCalled();
  });

  it.each([
    ["idle", 204],
    ["stale", 204],
    ["completed", 204],
    ["failed", 204],
    ["cleanup_required", 204],
    ["abandoned", 204],
    ["already_owned", 503],
    ["claim_lost", 503],
    ["cleanup_pending", 503],
  ] as const)("maps worker result %s to %s", async (status, expectedStatus) => {
    const fixture = serviceFixture({ workerResult: workerResult(status) });
    expect((await fixture.service.handle(taskRequest())).statusCode).toBe(expectedStatus);
  });

  it("retries an exception before an authoritative worker result", async () => {
    const fixture = serviceFixture({ workerError: new Error("temporary storage failure") });
    expect((await fixture.service.handle(taskRequest())).statusCode).toBe(503);
  });

  it("admits at most one valid task and never reads the busy task from the database", async () => {
    let release!: () => void;
    const running = new Promise<ProductActivationWorkerResult>((resolve) => {
      release = () => resolve({ status: "completed", ...payload });
    });
    const fixture = serviceFixture({ workerPromise: running });
    const first = fixture.service.handle(taskRequest());
    await vi.waitFor(() => expect(fixture.worker.run).toHaveBeenCalledTimes(1));

    const second = await fixture.service.handle(taskRequest());
    expect(second.statusCode).toBe(503);
    expect(fixture.repository.recordDispatchResult).toHaveBeenCalledTimes(1);

    release();
    expect((await first).statusCode).toBe(204);
  });

  it("becomes unready immediately when shutdown starts", async () => {
    const fixture = serviceFixture();
    fixture.service.beginShutdown();

    expect(
      (await fixture.service.handle(request("GET", PRODUCT_ACTIVATION_HEALTH_PATH))).statusCode,
    ).toBe(503);
    expect((await fixture.service.handle(taskRequest())).statusCode).toBe(503);
    expect(fixture.getRepository).not.toHaveBeenCalled();
  });
});

function serviceFixture(
  options: {
    identityVerifier?: TaskIdentityVerifier;
    dispatchResult?: ProductActivationDispatchResult;
    repositoryError?: Error;
    workerResult?: ProductActivationWorkerResult;
    workerError?: Error;
    workerPromise?: Promise<ProductActivationWorkerResult>;
  } = {},
) {
  const identityVerifier = options.identityVerifier ?? {
    verify: vi.fn(async () => ({ email: "task-caller@example.iam.gserviceaccount.com" })),
  };
  const repository = {
    recordDispatchResult: vi.fn(async () => {
      if (options.repositoryError) throw options.repositoryError;
      return options.dispatchResult ?? dispatchResult("recorded");
    }),
  } satisfies Pick<ProductActivationRepository, "recordDispatchResult">;
  const worker = {
    run: vi.fn(async () => {
      if (options.workerError) throw options.workerError;
      if (options.workerPromise) return options.workerPromise;
      return options.workerResult ?? workerResult("completed");
    }),
  };
  const logs: ProductActivationWorkerLog[] = [];
  const getRepository = vi.fn(async () => repository);
  const createWorker = vi.fn(async () => worker);
  return {
    identityVerifier,
    repository,
    worker,
    getRepository,
    createWorker,
    logs,
    service: new ProductActivationWorkerService({
      identityVerifier,
      expectedServiceAccount: "task-caller@example.iam.gserviceaccount.com",
      getRepository,
      createWorker,
      log: (entry) => logs.push(entry),
    }),
  };
}

function request(
  method: string,
  pathname: string,
  options: {
    authorization?: string | null;
    contentType?: string | null;
    contentLength?: string;
    bodyText?: string;
    body?: AsyncIterable<Uint8Array>;
  } = {},
): ProductActivationWorkerRequest {
  const headers = new Headers();
  if (options.authorization === undefined) headers.set("authorization", "Bearer signed-token");
  else if (options.authorization !== null) headers.set("authorization", options.authorization);
  if (options.contentType === undefined) headers.set("content-type", "application/json");
  else if (options.contentType !== null) headers.set("content-type", options.contentType);
  if (options.contentLength !== undefined) headers.set("content-length", options.contentLength);
  const bodyText = options.bodyText ?? JSON.stringify(payload);
  return {
    method,
    pathname,
    headers,
    body: options.body ?? chunks(Buffer.from(bodyText)),
  };
}

function taskRequest(): ProductActivationWorkerRequest {
  return request("POST", PRODUCT_ACTIVATION_TASK_PATH);
}

async function* chunks(...values: Uint8Array[]): AsyncIterable<Uint8Array> {
  yield* values;
}

function failingBody(): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<Uint8Array>> {
          throw new Error("connection reset");
        },
      };
    },
  };
}

function dispatchResult(
  result: ProductActivationDispatchResult["result"],
  dispatchStatus: ProductActivationDispatchResult["dispatchStatus"] = "dispatched",
): ProductActivationDispatchResult {
  return { result, ...payload, dispatchStatus, dispatchRequired: false };
}

function workerResult(
  status: ProductActivationWorkerResult["status"],
): ProductActivationWorkerResult {
  if (["idle", "already_owned", "stale"].includes(status)) {
    return { status } as ProductActivationWorkerResult;
  }
  return { status, ...payload } as ProductActivationWorkerResult;
}
