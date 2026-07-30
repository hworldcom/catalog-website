import { describe, expect, it, vi } from "vitest";

import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import {
  ClassifierBatchProvisioningClientError,
  type ClassifierBatchProvisioner,
} from "./classifier-batch-provisioning-api";
import type {
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
} from "./seller-classifier-batch.repository";
import { SellerClassifierBatchService } from "./seller-classifier-batch.service";

describe("SellerClassifierBatchService", () => {
  it("durably creates ownership before provisioning the classifier batch", async () => {
    const repository = repositoryMock();
    const provisioner = provisionerMock();
    const service = new SellerClassifierBatchService(repository, provisioner, uuid(3));

    await expect(
      service.create({ sellerId: uuid(4), userId: uuid(5), requestId: uuid(6) }),
    ).resolves.toEqual(safeReadySnapshot());

    expect(repository.createOrGet).toHaveBeenCalledWith({
      sellerId: uuid(4),
      clientRequestId: uuid(6),
      classifierOrganizationId: uuid(3),
      initiatedByUserId: uuid(5),
      initiatorKind: "seller",
    });
    expect(repository.createOrGet).toHaveBeenCalledBefore(provisioner.createBatch);
    expect(provisioner.createBatch).toHaveBeenCalledWith(uuid(1));
    expect(repository.completeProvisioning).toHaveBeenCalledWith({
      workflowId: uuid(1),
      classifierBatchId: uuid(2),
      maxFiles: 20,
      maxFileSizeBytes: 20 * 1024 * 1024,
    });
    expect(safeReadySnapshot()).not.toHaveProperty("sellerId");
    expect(safeReadySnapshot()).not.toHaveProperty("classifierBatchId");
  });

  it("records an administrator initiator for delegated creation", async () => {
    const repository = repositoryMock();
    const service = new SellerClassifierBatchService(repository, provisionerMock(), uuid(3));

    await service.createForAdministrator({
      sellerId: uuid(4),
      userId: uuid(5),
      requestId: uuid(6),
    });

    expect(repository.createOrGet).toHaveBeenCalledWith({
      sellerId: uuid(4),
      clientRequestId: uuid(6),
      classifierOrganizationId: uuid(3),
      initiatedByUserId: uuid(5),
      initiatorKind: "administrator",
    });
  });

  it("returns an existing ready workflow without calling the classifier", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.createOrGet).mockResolvedValueOnce({
      operation: "existing",
      record: readyRecord(),
    });
    const provisioner = provisionerMock();

    await expect(
      new SellerClassifierBatchService(repository, provisioner, uuid(3)).create({
        sellerId: uuid(4),
        userId: uuid(5),
        requestId: uuid(6),
      }),
    ).resolves.toEqual(safeReadySnapshot());
    expect(provisioner.createBatch).not.toHaveBeenCalled();
  });

  it("rejects a concurrent unfinished create request", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.createOrGet).mockResolvedValueOnce({
      operation: "existing",
      record: provisioningRecord(),
    });

    await expectBatchError(
      new SellerClassifierBatchService(repository, provisionerMock(), uuid(3)).create({
        sellerId: uuid(4),
        userId: uuid(5),
        requestId: uuid(6),
      }),
      409,
      "seller_classifier_batch_provisioning_in_progress",
    );
  });

  it("persists retryable ambiguous classifier failures", async () => {
    const repository = repositoryMock();
    const provisioner = provisionerMock();
    provisioner.createBatch.mockRejectedValueOnce(new ClassifierBatchProvisioningClientError(true));

    await expectBatchError(
      new SellerClassifierBatchService(repository, provisioner, uuid(3)).create({
        sellerId: uuid(4),
        userId: uuid(5),
        requestId: uuid(6),
      }),
      503,
      "seller_classifier_unavailable",
    );
    expect(repository.failProvisioning).toHaveBeenCalledWith({
      workflowId: uuid(1),
      errorCode: "seller_classifier_unavailable",
      retryable: true,
    });
  });

  it("atomically claims retry before recovering with the same workflow key", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.claimRetry).mockResolvedValueOnce({
      operation: "claimed",
      record: provisioningRecord(),
    });
    const provisioner = provisionerMock();

    await expect(
      new SellerClassifierBatchService(repository, provisioner, uuid(3)).retry(uuid(1), uuid(4)),
    ).resolves.toEqual(safeReadySnapshot());
    expect(repository.claimRetry).toHaveBeenCalledWith(uuid(1), uuid(4));
    expect(repository.claimRetry).toHaveBeenCalledBefore(provisioner.createBatch);
    expect(provisioner.createBatch).toHaveBeenCalledWith(uuid(1));
  });

  it("rejects a non-retryable provisioning failure", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.claimRetry).mockResolvedValueOnce({
      operation: "not_retryable",
      record: failedRecord(false),
    });

    await expectBatchError(
      new SellerClassifierBatchService(repository, provisionerMock(), uuid(3)).retry(
        uuid(1),
        uuid(4),
      ),
      409,
      "seller_classifier_batch_provisioning_not_retryable",
    );
  });

  it("uses seller-scoped ownership lookup and hides another seller's workflow", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.findOwned).mockResolvedValueOnce(null);

    await expectBatchError(
      new SellerClassifierBatchService(repository, provisionerMock(), uuid(3)).get(
        uuid(1),
        uuid(99),
      ),
      404,
      "seller_classifier_batch_not_found",
    );
    expect(repository.findOwned).toHaveBeenCalledWith(uuid(1), uuid(99));
  });
});

function repositoryMock(): SellerClassifierBatchRepository & {
  [key: string]: ReturnType<typeof vi.fn>;
} {
  return {
    createOrGet: vi.fn(async () => ({
      operation: "created" as const,
      record: provisioningRecord(),
    })),
    findOwned: vi.fn(async () => readyRecord()),
    completeProvisioning: vi.fn(async () => ({
      operation: "completed" as const,
      record: readyRecord(),
    })),
    failProvisioning: vi.fn(async (input: { retryable: boolean }) => ({
      operation: "failed" as const,
      record: failedRecord(input.retryable),
    })),
    claimRetry: vi.fn(),
    recordObservation: vi.fn(),
    recordReviewObservation: vi.fn(),
    recordApproved: vi.fn(),
  } as SellerClassifierBatchRepository & {
    [key: string]: ReturnType<typeof vi.fn>;
  };
}

function provisionerMock(): ClassifierBatchProvisioner & {
  createBatch: ReturnType<typeof vi.fn>;
} {
  return {
    createBatch: vi.fn(async () => ({
      batchId: uuid(2),
      status: "created",
      created: true,
      maxFiles: 20,
      maxFileSizeBytes: 20 * 1024 * 1024,
    })),
  };
}

function provisioningRecord(): SellerClassifierBatchRecord {
  return {
    ...baseRecord(),
    classifierBatchId: null,
    maxFiles: null,
    maxFileSizeBytes: null,
    provisioningStatus: "provisioning",
    lastKnownStage: "provisioning",
    errorCode: null,
    retryable: false,
  };
}

function readyRecord(): SellerClassifierBatchRecord {
  return {
    ...baseRecord(),
    classifierBatchId: uuid(2),
    maxFiles: 20,
    maxFileSizeBytes: 20 * 1024 * 1024,
    provisioningStatus: "ready",
    lastKnownStage: "upload",
    errorCode: null,
    retryable: false,
  };
}

function failedRecord(retryable: boolean): SellerClassifierBatchRecord {
  return {
    ...baseRecord(),
    classifierBatchId: null,
    maxFiles: null,
    maxFileSizeBytes: null,
    provisioningStatus: "failed",
    lastKnownStage: "failed",
    errorCode: "seller_classifier_unavailable",
    retryable,
  };
}

function baseRecord(): SellerClassifierBatchRecord {
  return {
    id: uuid(1),
    sellerId: uuid(4),
    clientRequestId: uuid(6),
    classifierOrganizationId: uuid(3),
    classifierBatchId: null,
    maxFiles: null,
    maxFileSizeBytes: null,
    provisioningStatus: "provisioning",
    lastKnownStage: "provisioning",
    originalFileCount: 0,
    processedFileCount: 0,
    groupCount: 0,
    productDraftCount: 0,
    errorCode: null,
    retryable: false,
    initiatedByUserId: uuid(5),
    initiatorKind: "seller",
    createdAt: "2026-07-27T10:00:00Z",
    updatedAt: "2026-07-27T10:01:00Z",
  };
}

function safeReadySnapshot() {
  return {
    workflowId: uuid(1),
    provisioningStatus: "ready",
    stage: "upload",
    errorCode: null,
    retryAllowed: false,
    maxFiles: 20,
    maxFileSizeBytes: 20 * 1024 * 1024,
    createdAt: "2026-07-27T10:00:00Z",
    updatedAt: "2026-07-27T10:01:00Z",
  };
}

async function expectBatchError(promise: Promise<unknown>, statusCode: number, code: string) {
  try {
    await promise;
    throw new Error("Expected seller classifier operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(SellerClassifierBatchError);
    expect(error).toMatchObject({ statusCode, code });
  }
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
