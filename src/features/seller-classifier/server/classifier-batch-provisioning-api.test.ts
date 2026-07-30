import { describe, expect, it, vi } from "vitest";

import {
  ClassifierBatchProvisioningClient,
  ClassifierBatchProvisioningClientError,
} from "./classifier-batch-provisioning-api";

describe("ClassifierBatchProvisioningClient", () => {
  it("creates a batch with the workflow id as the idempotency key", async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        batchId: uuid(2),
        status: "created",
        created: true,
        maxFiles: 20,
        maxFileSizeBytes: 20 * 1024 * 1024,
      }),
    );
    const client = createClient(fetchImplementation);

    await expect(client.createBatch(uuid(1))).resolves.toEqual({
      batchId: uuid(2),
      status: "created",
      created: true,
      maxFiles: 20,
      maxFileSizeBytes: 20 * 1024 * 1024,
    });

    const [input, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(input)).toBe("http://classifier.test/v1/upload-batches");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(uuid(1));
    expect(init?.method).toBe("POST");
  });

  it.each([
    [429, true],
    [503, true],
    [400, false],
  ])("classifies HTTP %s retryability", async (status, retryable) => {
    const client = createClient(async () => new Response(null, { status }));
    await expectClientError(client.createBatch(uuid(1)), retryable);
  });

  it("treats network failures as retryable", async () => {
    const client = createClient(async () => {
      throw new Error("connection reset");
    });
    await expectClientError(client.createBatch(uuid(1)), true);
  });

  it("treats an invalid success response as non-retryable", async () => {
    const client = createClient(async () => Response.json({ batchId: "invalid" }));
    await expectClientError(client.createBatch(uuid(1)), false);
  });
});

function createClient(fetchImplementation: typeof fetch): ClassifierBatchProvisioningClient {
  return new ClassifierBatchProvisioningClient({
    baseUrl: "http://classifier.test",
    timeoutMs: 100,
    fetchImplementation,
  });
}

async function expectClientError(promise: Promise<unknown>, retryable: boolean) {
  try {
    await promise;
    throw new Error("Expected classifier provisioning to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ClassifierBatchProvisioningClientError);
    expect(error).toMatchObject({ retryable });
  }
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
