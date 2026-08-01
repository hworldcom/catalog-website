import { describe, expect, it, vi } from "vitest";

import {
  ClassifierMultimodalComparisonClientError,
  HttpClassifierMultimodalComparisonClient,
} from "./classifier-multimodal-comparison-api";

describe("HttpClassifierMultimodalComparisonClient", () => {
  it("uses the durable dispatch and side-effect-free status endpoints", async () => {
    const fetchImplementation = vi.fn(async () => Response.json(runResponse()));
    const client = createClient(fetchImplementation);

    await client.dispatch(batchId);
    await client.getStatus(batchId);

    expect(
      fetchImplementation.mock.calls.map(([input, init]) => ({
        path: new URL(String(input)).pathname,
        method: init?.method ?? "GET",
      })),
    ).toEqual([
      {
        path: `/v1/upload-batches/${batchId}/multimodal-comparison-runs`,
        method: "POST",
      },
      {
        path: `/v1/upload-batches/${batchId}/multimodal-comparison-runs/current`,
        method: "GET",
      },
    ]);
  });

  it("rejects malformed successful responses separately from transport failures", async () => {
    const malformed = createClient(async () =>
      Response.json({ ...runResponse(), providerResponse: "private" }),
    );
    await expect(malformed.getStatus(batchId)).rejects.toMatchObject({
      failureKind: "invalid_response",
      statusCode: null,
    });

    const unavailable = createClient(async () => {
      throw new Error("network details");
    });
    await expect(unavailable.getStatus(batchId)).rejects.toMatchObject({
      failureKind: "transport",
      statusCode: null,
    });
  });

  it("retains only the classifier status and stable error code", async () => {
    const client = createClient(async () =>
      Response.json(
        {
          detail: {
            code: "multimodal_comparison_not_allowed",
            message: "private review state details",
          },
        },
        { status: 409 },
      ),
    );

    try {
      await client.dispatch(batchId);
      throw new Error("Expected dispatch to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ClassifierMultimodalComparisonClientError);
      expect(error).toMatchObject({
        operation: "dispatch_comparison",
        failureKind: "http",
        statusCode: 409,
        classifierCode: "multimodal_comparison_not_allowed",
        message: "The classifier multimodal comparison request failed.",
      });
    }
  });
});

function createClient(fetchImplementation: typeof fetch) {
  return new HttpClassifierMultimodalComparisonClient({
    baseUrl: "http://classifier.test",
    timeoutMs: 100,
    fetchImplementation,
  });
}

function runResponse() {
  return {
    batchId,
    runId,
    status: "started",
    attemptCount: 1,
    retryable: false,
    errorCode: null,
    createdAt: "2026-08-01T10:00:00Z",
    startedAt: "2026-08-01T10:00:01Z",
    completedAt: null,
  };
}

const batchId = uuid(1);
const runId = uuid(2);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
