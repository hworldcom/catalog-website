import { describe, expect, it, vi } from "vitest";

import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import {
  ClassifierMultimodalComparisonClientError,
  type ClassifierMultimodalComparisonClient,
  type ClassifierMultimodalComparisonRun,
} from "./classifier-multimodal-comparison-api";
import type {
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
} from "./seller-classifier-batch.repository";
import { SellerClassifierComparisonService } from "./seller-classifier-comparison.service";

describe("SellerClassifierComparisonService", () => {
  it("resolves seller ownership and removes classifier identifiers from running status", async () => {
    const { classifier, repository, service } = setup();

    const result = await service.getStatus(workflowId, sellerId);

    expect(repository.findOwned).toHaveBeenCalledWith(workflowId, sellerId);
    expect(classifier.getStatus).toHaveBeenCalledWith(batchId);
    expect(result).toEqual({
      workflowId,
      status: "running",
      attemptCount: 1,
      retryable: false,
      failureCode: null,
    });
    expect(JSON.stringify(result)).not.toContain(batchId);
    expect(JSON.stringify(result)).not.toContain(runId);
    expect(JSON.stringify(result)).not.toContain(organizationId);
  });

  it("does not contact the classifier for unknown or cross-seller workflows", async () => {
    const { classifier, repository, service } = setup();
    repository.findOwned.mockResolvedValueOnce(null);

    await expectError(
      service.dispatch(workflowId, otherSellerId),
      404,
      "seller_classifier_batch_not_found",
    );
    expect(classifier.dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ["multimodal_comparison_dispatch_failed", "comparison_dispatch_unavailable", true],
    ["multimodal_comparison_provider_failed", "comparison_provider_unavailable", true],
    ["multimodal_comparison_storage_failed", "comparison_storage_unavailable", true],
    ["multimodal_comparison_database_failed", "comparison_persistence_unavailable", true],
    ["multimodal_comparison_not_allowed", "comparison_not_allowed", false],
    ["multimodal_comparison_claim_expired", "comparison_claim_expired", true],
  ] as const)("maps %s to %s", async (classifierCode, browserCode, retryable) => {
    const { classifier, service } = setup();
    classifier.getStatus.mockResolvedValueOnce(
      runResponse({
        status: "failed",
        errorCode: classifierCode,
        retryable,
        completedAt: "2026-08-01T10:01:00Z",
      }),
    );

    await expect(service.getStatus(workflowId, sellerId)).resolves.toEqual({
      workflowId,
      status: "failed",
      attemptCount: 1,
      retryable,
      failureCode: browserCode,
    });
  });

  it("maps and logs an unknown non-retryable classifier failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { classifier, service } = setup();
    classifier.getStatus.mockResolvedValueOnce(
      runResponse({
        status: "failed",
        errorCode: "new_private_failure",
        retryable: false,
        completedAt: "2026-08-01T10:01:00Z",
      }),
    );

    await expect(service.getStatus(workflowId, sellerId)).resolves.toMatchObject({
      failureCode: "comparison_unknown_failure",
      retryable: false,
    });
    expect(log).toHaveBeenCalledWith(
      "[Seller classifier comparison] Unknown classifier failure code.",
      { workflowId, classifierErrorCode: "new_private_failure" },
    );
    log.mockRestore();
  });

  it("rejects mismatched and internally inconsistent classifier responses", async () => {
    const mismatch = setup();
    mismatch.classifier.getStatus.mockResolvedValueOnce(runResponse({ batchId: otherBatchId }));
    await expectError(
      mismatch.service.getStatus(workflowId, sellerId),
      503,
      "seller_classifier_integration_unavailable",
    );

    const invalidActive = setup();
    invalidActive.classifier.getStatus.mockResolvedValueOnce(runResponse({ retryable: true }));
    await expectError(
      invalidActive.service.getStatus(workflowId, sellerId),
      503,
      "seller_classifier_integration_unavailable",
    );

    const invalidFailure = setup();
    invalidFailure.classifier.getStatus.mockResolvedValueOnce(
      runResponse({ status: "failed", errorCode: null }),
    );
    await expectError(
      invalidFailure.service.getStatus(workflowId, sellerId),
      503,
      "seller_classifier_integration_unavailable",
    );

    const retryableUnknown = setup();
    retryableUnknown.classifier.getStatus.mockResolvedValueOnce(
      runResponse({ status: "failed", errorCode: "private_unknown", retryable: true }),
    );
    await expectError(
      retryableUnknown.service.getStatus(workflowId, sellerId),
      503,
      "seller_classifier_integration_unavailable",
    );
  });

  it("maps direct dispatch conflicts without collapsing transport or response failures", async () => {
    const conflict = setup();
    conflict.classifier.dispatch.mockRejectedValueOnce(
      clientError("dispatch_comparison", "http", 409, "multimodal_comparison_not_allowed"),
    );
    await expectError(
      conflict.service.dispatch(workflowId, sellerId),
      409,
      "seller_classifier_multimodal_comparison_not_allowed",
    );

    const transport = setup();
    transport.classifier.dispatch.mockRejectedValueOnce(
      clientError("dispatch_comparison", "transport", null, null),
    );
    await expectError(
      transport.service.dispatch(workflowId, sellerId),
      503,
      "seller_classifier_multimodal_comparison_unavailable",
    );

    const malformed = setup();
    malformed.classifier.dispatch.mockRejectedValueOnce(
      clientError("dispatch_comparison", "invalid_response", null, null),
    );
    await expectError(
      malformed.service.dispatch(workflowId, sellerId),
      503,
      "seller_classifier_integration_unavailable",
    );

    const missingClassifierBatch = setup();
    missingClassifierBatch.classifier.getStatus.mockRejectedValueOnce(
      clientError("read_comparison", "http", 404, "upload_batch_not_found"),
    );
    await expectError(
      missingClassifierBatch.service.getStatus(workflowId, sellerId),
      503,
      "seller_classifier_integration_unavailable",
    );
  });
});

function setup() {
  const repository = {
    createOrGet: vi.fn(),
    findOwned: vi.fn(async () => record()),
    completeProvisioning: vi.fn(),
    failProvisioning: vi.fn(),
    claimRetry: vi.fn(),
    recordObservation: vi.fn(),
    recordReviewObservation: vi.fn(),
    recordApproved: vi.fn(),
  } satisfies SellerClassifierBatchRepository;
  const classifier = {
    dispatch: vi.fn(async () => runResponse()),
    getStatus: vi.fn(async () => runResponse()),
  } satisfies ClassifierMultimodalComparisonClient;
  return {
    repository,
    classifier,
    service: new SellerClassifierComparisonService(repository, classifier, organizationId),
  };
}

function runResponse(
  overrides: Partial<ClassifierMultimodalComparisonRun> = {},
): ClassifierMultimodalComparisonRun {
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
    ...overrides,
  };
}

function clientError(
  operation: "dispatch_comparison" | "read_comparison",
  failureKind: "http" | "transport" | "invalid_response",
  statusCode: number | null,
  classifierCode: string | null,
) {
  return new ClassifierMultimodalComparisonClientError(
    operation,
    failureKind,
    statusCode,
    classifierCode,
  );
}

function record(overrides: Partial<SellerClassifierBatchRecord> = {}): SellerClassifierBatchRecord {
  return {
    id: workflowId,
    sellerId,
    clientRequestId: uuid(20),
    classifierOrganizationId: organizationId,
    classifierBatchId: batchId,
    maxFiles: 20,
    maxFileSizeBytes: 20 * 1024 * 1024,
    provisioningStatus: "ready",
    lastKnownStage: "review",
    originalFileCount: 3,
    processedFileCount: 3,
    groupCount: 2,
    productDraftCount: 0,
    errorCode: null,
    retryable: false,
    initiatedByUserId: uuid(21),
    initiatorKind: "seller",
    createdAt: "2026-08-01T09:00:00Z",
    updatedAt: "2026-08-01T09:00:00Z",
    ...overrides,
  };
}

async function expectError(
  promise: Promise<unknown>,
  statusCode: number,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(SellerClassifierBatchError);
    expect(error).toMatchObject({ statusCode, code });
  }
}

const workflowId = uuid(1);
const batchId = uuid(2);
const otherBatchId = uuid(3);
const runId = uuid(4);
const organizationId = uuid(5);
const sellerId = uuid(6);
const otherSellerId = uuid(7);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
