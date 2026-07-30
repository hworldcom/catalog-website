import { describe, expect, it, vi } from "vitest";

import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import {
  ClassifierWorkflowClientError,
  type ClassifierWorkflowClient,
} from "./classifier-workflow-api";
import type {
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
} from "./seller-classifier-batch.repository";
import { SellerClassifierWorkflowService } from "./seller-classifier-workflow.service";

describe("SellerClassifierWorkflowService", () => {
  it("registers only after seller-scoped ownership and strips object keys", async () => {
    const { repository, classifier, service } = setup();

    const result = await service.register(sellerId, {
      workflowId,
      files: [{ originalFilename: "front.jpg", mimeType: "image/jpeg", sizeBytes: 100 }],
    });

    expect(repository.findOwned).toHaveBeenCalledWith(workflowId, sellerId);
    expect(classifier.registerUploads).toHaveBeenCalledWith(batchId, [
      { originalFilename: "front.jpg", mimeType: "image/jpeg", sizeBytes: 100 },
    ]);
    expect(result.uploads[0]).not.toHaveProperty("originalObjectKey");
    expect(repository.recordObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId,
        sellerId,
        observationKind: "upload",
        stage: "upload",
        originalFileCount: 1,
      }),
    );
  });

  it("does not contact the classifier for another seller's workflow", async () => {
    const { repository, classifier, service } = setup();
    repository.findOwned.mockResolvedValueOnce(null);

    await expectError(service.getUploads(workflowId, otherSellerId), 404);
    expect(classifier.getUpload).not.toHaveBeenCalled();
  });

  it("enforces stored upload limits before requesting signed URLs", async () => {
    const { classifier, service } = setup({ maxFileSizeBytes: 99 });

    await expectError(
      service.register(sellerId, {
        workflowId,
        files: [{ originalFilename: "front.jpg", mimeType: "image/jpeg", sizeBytes: 100 }],
      }),
      400,
    );
    expect(classifier.registerUploads).not.toHaveBeenCalled();
  });

  it("finalizes and starts processing in one server operation", async () => {
    const { classifier, repository, service } = setup();
    classifier.finalize.mockResolvedValueOnce(uploadSnapshot("queued"));

    const result = await service.finalize(workflowId, sellerId);

    expect(classifier.finalize).toHaveBeenCalledWith(batchId);
    expect(classifier.startProcessing).toHaveBeenCalledWith(batchId);
    expect(result.processing).toMatchObject({ stage: "processing", status: "processing" });
    expect(repository.recordObservation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ observationKind: "upload", stage: "upload" }),
    );
    expect(repository.recordObservation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ observationKind: "processing", stage: "processing" }),
    );
  });

  it("does not start processing when finalization finds missing uploads", async () => {
    const { classifier, service } = setup();
    classifier.finalize.mockResolvedValueOnce(uploadSnapshot("uploading", "failed"));

    const result = await service.finalize(workflowId, sellerId);

    expect(result.processing).toBeNull();
    expect(result.upload.images[0]).toMatchObject({
      errorCode: "object_missing",
      retryAllowed: true,
    });
    expect(classifier.startProcessing).not.toHaveBeenCalled();
  });

  it("sanitizes raw job errors and advances to review", async () => {
    const { classifier, service } = setup();
    classifier.getProcessing.mockResolvedValueOnce(
      processingSnapshot("review_required", {
        processJobStatus: "failed",
        processError: "provider secret should never be returned",
      }),
    );

    const result = await service.getProcessing(workflowId, sellerId);

    expect(result.stage).toBe("review");
    expect(result.images[0]?.processError).toEqual({
      code: "image_processing_failed",
      message: "Image processing failed.",
    });
    expect(JSON.stringify(result)).not.toContain("provider secret");
  });

  it("returns the durable later stage when an older response loses the race", async () => {
    const { repository, service } = setup();
    repository.recordObservation.mockResolvedValueOnce({
      operation: "stale",
      record: record({ lastKnownStage: "review" }),
    });

    await expect(service.getProcessing(workflowId, sellerId)).resolves.toMatchObject({
      stage: "review",
    });
  });

  it("maps classifier conflicts to command-specific stable errors", async () => {
    const { classifier, service } = setup();
    classifier.finalize.mockRejectedValueOnce(
      new ClassifierWorkflowClientError("finalize", 409, "invalid_batch_state"),
    );

    try {
      await service.finalize(workflowId, sellerId);
      throw new Error("Expected finalization to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SellerClassifierBatchError);
      expect(error).toMatchObject({
        statusCode: 409,
        code: "seller_classifier_upload_not_allowed",
      });
    }
  });
});

function setup(overrides: Partial<SellerClassifierBatchRecord> = {}) {
  let current = record(overrides);
  const repository = {
    createOrGet: vi.fn(),
    findOwned: vi.fn(async () => current),
    completeProvisioning: vi.fn(),
    failProvisioning: vi.fn(),
    claimRetry: vi.fn(),
    recordObservation: vi.fn(async (input) => {
      current = record({
        ...current,
        lastKnownStage: input.stage,
        originalFileCount: Math.max(current.originalFileCount, input.originalFileCount),
        processedFileCount: Math.max(current.processedFileCount, input.processedFileCount),
        errorCode: input.errorCode,
        retryable: input.retryable,
      });
      return { operation: "recorded" as const, record: current };
    }),
    recordReviewObservation: vi.fn(),
    recordApproved: vi.fn(),
  } satisfies SellerClassifierBatchRepository;
  const classifier = {
    registerUploads: vi.fn(async () => registration()),
    retryUploads: vi.fn(async () => registration()),
    getUpload: vi.fn(async () => uploadSnapshot("uploading")),
    finalize: vi.fn(async () => uploadSnapshot("queued")),
    startProcessing: vi.fn(async () => processingSnapshot("processing")),
    getProcessing: vi.fn(async () => processingSnapshot("processing")),
  } satisfies ClassifierWorkflowClient;
  return {
    repository,
    classifier,
    service: new SellerClassifierWorkflowService(repository, classifier, organizationId),
  };
}

function registration() {
  return {
    batchId,
    status: "uploading" as const,
    uploads: [
      {
        imageId,
        uploadOrder: 0,
        originalFilename: "front.jpg",
        originalObjectKey: "private/object.jpg",
        uploadUrl: "https://storage.example.test/signed",
      },
    ],
  };
}

function uploadSnapshot(
  status: "uploading" | "queued",
  imageStatus: "pending" | "failed" = status === "queued" ? "pending" : "pending",
) {
  return {
    batchId,
    status,
    originalFileCount: 1,
    processedFileCount: 0,
    createdAt: "2026-07-27T10:00:00Z",
    finalizedAt: status === "queued" ? "2026-07-27T10:01:00Z" : null,
    completedAt: null,
    images: [
      {
        imageId,
        uploadOrder: 0,
        originalFilename: "front.jpg",
        status: imageStatus,
        errorCode: imageStatus === "failed" ? "object_missing" : null,
        errorMessage: imageStatus === "failed" ? "internal storage detail" : null,
      },
    ],
  };
}

function processingSnapshot(
  status: "processing" | "review_required",
  overrides: Partial<ReturnType<typeof processingImage>> = {},
) {
  return {
    batchId,
    status,
    originalFileCount: 1,
    processedFileCount: status === "review_required" ? 1 : 0,
    pipelineVersion: "2026-06-01",
    images: [processingImage(overrides)],
  };
}

function processingImage(
  overrides: Partial<{
    processJobStatus: string | null;
    processError: string | null;
  }> = {},
) {
  return {
    imageId,
    uploadOrder: 0,
    originalFilename: "front.jpg",
    imageStatus: "processed" as const,
    processJobStatus: "completed",
    processError: null,
    classifyJobStatus: "completed",
    classifyError: null,
    categorySlug: "t-shirts",
    confidence: 0.95,
    hasHashes: true,
    hasEmbedding: true,
    ...overrides,
  };
}

function record(overrides: Partial<SellerClassifierBatchRecord> = {}): SellerClassifierBatchRecord {
  return {
    id: workflowId,
    sellerId,
    clientRequestId: uuid(6),
    classifierOrganizationId: organizationId,
    classifierBatchId: batchId,
    maxFiles: 20,
    maxFileSizeBytes: 10 * 1024 * 1024,
    provisioningStatus: "ready",
    lastKnownStage: "upload",
    originalFileCount: 0,
    processedFileCount: 0,
    groupCount: 0,
    productDraftCount: 0,
    errorCode: null,
    retryable: false,
    initiatedByUserId: uuid(7),
    initiatorKind: "seller",
    createdAt: "2026-07-27T10:00:00Z",
    updatedAt: "2026-07-27T10:00:00Z",
    ...overrides,
  };
}

async function expectError(promise: Promise<unknown>, statusCode: number) {
  try {
    await promise;
    throw new Error("Expected operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(SellerClassifierBatchError);
    expect(error).toMatchObject({ statusCode });
  }
}

const workflowId = uuid(1);
const batchId = uuid(2);
const imageId = uuid(3);
const sellerId = uuid(4);
const otherSellerId = uuid(5);
const organizationId = uuid(9);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
