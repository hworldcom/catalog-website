import { describe, expect, it, vi } from "vitest";

import {
  ClassifierWorkflowClientError,
  HttpClassifierWorkflowClient,
} from "./classifier-workflow-api";

describe("HttpClassifierWorkflowClient", () => {
  it("registers metadata through the durable classifier endpoint", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({
        batchId: uuid(1),
        status: "uploading",
        uploads: [
          {
            imageId: uuid(2),
            uploadOrder: 0,
            originalFilename: "front.jpg",
            originalObjectKey: "private/object.jpg",
            uploadUrl: "https://storage.example.test/signed",
          },
        ],
      }),
    );
    const client = createClient(fetchImplementation);

    await expect(
      client.registerUploads(uuid(1), [
        {
          originalFilename: "front.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 100,
        },
      ]),
    ).resolves.toMatchObject({ batchId: uuid(1), status: "uploading" });

    const [input, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(input)).toBe(`http://classifier.test/v1/upload-batches/${uuid(1)}/uploads`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      files: [
        {
          originalFilename: "front.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 100,
        },
      ],
    });
  });

  it("uses explicit finalize and processing endpoints", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(uploadSnapshot("queued")))
      .mockResolvedValueOnce(Response.json(processingSnapshot("processing")));
    const client = createClient(fetchImplementation);

    await client.finalize(uuid(1));
    await client.startProcessing(uuid(1));

    expect(fetchImplementation.mock.calls.map(([input]) => String(input))).toEqual([
      `http://classifier.test/v1/upload-batches/${uuid(1)}/finalize`,
      `http://classifier.test/v1/upload-batches/${uuid(1)}/start-processing`,
    ]);
  });

  it("rejects invalid successful responses", async () => {
    const client = createClient(async () => Response.json({ status: "uploading" }));
    await expect(client.getUpload(uuid(1))).rejects.toMatchObject({
      operation: "read_upload",
      statusCode: null,
    });
  });

  it("retains classifier status and stable code without exposing its message", async () => {
    const client = createClient(async () =>
      Response.json(
        {
          detail: {
            code: "invalid_batch_state",
            message: "internal details",
          },
        },
        { status: 409 },
      ),
    );

    try {
      await client.finalize(uuid(1));
      throw new Error("Expected finalize to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ClassifierWorkflowClientError);
      expect(error).toMatchObject({
        operation: "finalize",
        statusCode: 409,
        classifierCode: "invalid_batch_state",
        message: "The classifier workflow request failed.",
      });
    }
  });
});

function createClient(fetchImplementation: typeof fetch) {
  return new HttpClassifierWorkflowClient({
    baseUrl: "http://classifier.test",
    timeoutMs: 100,
    fetchImplementation,
  });
}

function uploadSnapshot(status: string) {
  return {
    batchId: uuid(1),
    status,
    originalFileCount: 1,
    processedFileCount: 0,
    createdAt: "2026-07-27T10:00:00Z",
    finalizedAt: status === "queued" ? "2026-07-27T10:01:00Z" : null,
    completedAt: null,
    images: [
      {
        imageId: uuid(2),
        uploadOrder: 0,
        originalFilename: "front.jpg",
        status: "uploaded",
        errorCode: null,
        errorMessage: null,
      },
    ],
  };
}

function processingSnapshot(status: string) {
  return {
    batchId: uuid(1),
    status,
    originalFileCount: 1,
    processedFileCount: 0,
    pipelineVersion: "2026-06-01",
    images: [
      {
        imageId: uuid(2),
        uploadOrder: 0,
        originalFilename: "front.jpg",
        imageStatus: "uploaded",
        processJobStatus: "pending",
        processError: null,
        classifyJobStatus: null,
        classifyError: null,
        categorySlug: null,
        confidence: null,
        hasHashes: false,
        hasEmbedding: false,
      },
    ],
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
