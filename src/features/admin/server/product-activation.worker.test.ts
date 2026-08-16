import { describe, expect, it, vi } from "vitest";

import type { ProductActivationConfig } from "./product-activation.config";
import type { ProductActivationRepository } from "./product-activation.repository";
import type {
  ClaimedProductActivation,
  ClaimedProductActivationCleanup,
  ProductActivationItem,
} from "./product-activation.types";
import { ProductActivationWorker } from "./product-activation.worker";
import type {
  ProductPublicationObject,
  ProductPublicationStorage,
} from "@/features/seller/server/product-publication.storage";

const payload = { runId: uuid(1), dispatchGeneration: 1 };

describe("ProductActivationWorker", () => {
  it("copies, durably records, verifies, and atomically finalizes a claimed manifest", async () => {
    const repository = repositoryFixture();
    let destination: ProductPublicationObject | null = null;
    const storage = storageFixture({
      read: vi.fn(async (bucket) => {
        if (bucket === "product-draft-images") return object([1, 2, 3]);
        return destination;
      }),
      createPublicObject: vi.fn<ProductPublicationStorage["createPublicObject"]>(async (input) => {
        destination = object([...input.bytes]);
        return "created";
      }),
    });
    const worker = new ProductActivationWorker(repository, storage, config());

    const result = await worker.run(payload);

    expect(result).toMatchObject({ status: "completed", ...payload, attemptCount: 1 });
    expect(repository.recordObjectCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        ...payload,
        attemptToken: uuid(6),
        productDraftImageId: uuid(5),
        publicSizeBytes: 3,
      }),
    );
    expect(repository.verifyItem).toHaveBeenCalledWith(
      expect.objectContaining({
        ...payload,
        attemptToken: uuid(6),
        verifiedSizeBytes: 3,
      }),
    );
    expect(repository.finalize).toHaveBeenCalledWith({
      ...payload,
      attemptToken: uuid(6),
    });
  });

  it("fails safely when an unowned destination already exists", async () => {
    const repository = repositoryFixture();
    const storage = storageFixture({
      read: vi.fn(async (bucket) =>
        bucket === "product-draft-images" ? object([1, 2, 3]) : object([1, 2, 3]),
      ),
    });
    const worker = new ProductActivationWorker(repository, storage, config());

    const result = await worker.run(payload);

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "product_publication_destination_conflict",
    });
    expect(storage.createPublicObject).not.toHaveBeenCalled();
    expect(repository.failAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "product_publication_destination_conflict",
        productDraftImageId: uuid(5),
      }),
    );
    expect(repository.finalize).not.toHaveBeenCalled();
  });

  it("discards a late verification result after claim ownership changes", async () => {
    const repository = repositoryFixture({
      claimRun: vi.fn(async () => claimed({ objectCreatedByAttemptToken: uuid(9) })),
      verifyItem: vi.fn<ProductActivationRepository["verifyItem"]>(async () => "stale"),
    });
    const storage = storageFixture({
      read: vi.fn(async () => object([1, 2, 3])),
    });
    const worker = new ProductActivationWorker(repository, storage, config());

    const result = await worker.run(payload);

    expect(result).toMatchObject({ status: "claim_lost", ...payload });
    expect(repository.failAttempt).not.toHaveBeenCalled();
    expect(repository.finalize).not.toHaveBeenCalled();
  });

  it("does no storage work for stale or already-owned delivery", async () => {
    const storage = storageFixture();
    const staleWorker = new ProductActivationWorker(
      repositoryFixture({
        claimRun: vi.fn<ProductActivationRepository["claimRun"]>(async () => ({
          result: "stale",
        })),
      }),
      storage,
      config(),
    );
    const ownedWorker = new ProductActivationWorker(
      repositoryFixture({
        claimRun: vi.fn<ProductActivationRepository["claimRun"]>(async () => ({
          result: "owned",
        })),
      }),
      storage,
      config(),
    );

    await expect(staleWorker.run(payload)).resolves.toEqual({ status: "stale" });
    await expect(ownedWorker.run(payload)).resolves.toEqual({ status: "already_owned" });
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("verifies and deletes cleanup-owned public objects before completing cleanup", async () => {
    const repository = repositoryFixture({
      claimRun: vi.fn(async () => cleanupClaimed()),
      finalizeCleanup: vi.fn(async () => "completed"),
    });
    const storage = storageFixture({ read: vi.fn(async () => object([1, 2, 3])) });
    const worker = new ProductActivationWorker(repository, storage, config());

    await expect(worker.run(payload)).resolves.toMatchObject({ status: "completed", ...payload });
    expect(storage.deletePublicObject).toHaveBeenCalledWith(
      "products/cleanup.jpg",
      expect.any(AbortSignal),
    );
    expect(repository.recordCleanupItemResult).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationKey: "products/cleanup.jpg",
        result: "completed",
        errorCode: null,
      }),
    );
  });

  it("preserves a mismatched cleanup object and records a durable conflict", async () => {
    const repository = repositoryFixture({
      claimRun: vi.fn(async () => cleanupClaimed()),
      finalizeCleanup: vi.fn(async () => "cleanup_required"),
    });
    const storage = storageFixture({ read: vi.fn(async () => object([9, 9, 9])) });
    const worker = new ProductActivationWorker(repository, storage, config());

    await expect(worker.run(payload)).resolves.toMatchObject({
      status: "cleanup_required",
      errorCode: "product_activation_cleanup_destination_conflict",
    });
    expect(storage.deletePublicObject).not.toHaveBeenCalled();
    expect(repository.recordCleanupItemResult).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "failed",
        errorCode: "product_activation_cleanup_destination_conflict",
      }),
    );
  });
});

function repositoryFixture(
  overrides: Partial<ProductActivationRepository> = {},
): ProductActivationRepository {
  return {
    decide: vi.fn<ProductActivationRepository["decide"]>(),
    recordDispatchResult: vi.fn<ProductActivationRepository["recordDispatchResult"]>(),
    retryDispatch: vi.fn<ProductActivationRepository["retryDispatch"]>(),
    retryActivation: vi.fn<ProductActivationRepository["retryActivation"]>(),
    requestAbandonment: vi.fn<ProductActivationRepository["requestAbandonment"]>(),
    retryCleanup: vi.fn<ProductActivationRepository["retryCleanup"]>(),
    claimRun: vi.fn<ProductActivationRepository["claimRun"]>(async () => claimed()),
    continueCleanup: vi.fn<ProductActivationRepository["continueCleanup"]>(async () => ({
      result: "stale",
    })),
    recordObjectCreated: vi.fn<ProductActivationRepository["recordObjectCreated"]>(
      async () => "recorded",
    ),
    verifyItem: vi.fn<ProductActivationRepository["verifyItem"]>(async () => "verified"),
    failAttempt: vi.fn<ProductActivationRepository["failAttempt"]>(
      async () => "failed_non_retryable",
    ),
    failWorkerStart: vi.fn<ProductActivationRepository["failWorkerStart"]>(
      async () => "failed_retryable",
    ),
    finalize: vi.fn<ProductActivationRepository["finalize"]>(async () => "completed"),
    recordCleanupItemResult: vi.fn<ProductActivationRepository["recordCleanupItemResult"]>(
      async () => "completed",
    ),
    finalizeCleanup: vi.fn<ProductActivationRepository["finalizeCleanup"]>(async () => "completed"),
    listRecoverableDispatches: vi.fn<ProductActivationRepository["listRecoverableDispatches"]>(
      async () => [],
    ),
    ...overrides,
  };
}

function storageFixture(
  overrides: Partial<ProductPublicationStorage> = {},
): ProductPublicationStorage {
  return {
    read: vi.fn<ProductPublicationStorage["read"]>(async () => null),
    createPublicObject: vi.fn<ProductPublicationStorage["createPublicObject"]>(
      async () => "created",
    ),
    deletePublicObject: vi.fn<ProductPublicationStorage["deletePublicObject"]>(
      async () => undefined,
    ),
    publicUrl: vi.fn<ProductPublicationStorage["publicUrl"]>(
      (key) => `http://localhost/storage/${key}`,
    ),
    ...overrides,
  };
}

function claimed(itemOverrides: Partial<ProductActivationItem> = {}): ClaimedProductActivation {
  return {
    result: "claimed",
    phase: "activation",
    ...payload,
    submissionId: uuid(2),
    productId: uuid(3),
    sellerId: uuid(4),
    attemptCount: 1,
    attemptToken: uuid(6),
    snapshotHash: "a".repeat(64),
    expectedSubmissionRevision: 2,
    snapshot: { title: "QA shirt" },
    items: [
      {
        productDraftImageId: uuid(5),
        sourceBucket: "product-draft-images",
        sourceObjectKey: "drafts/source.jpg",
        destinationKey: `products/${uuid(3)}/runs/${uuid(1)}/${uuid(5)}.jpg`,
        sourcePosition: 0,
        publicationOrder: 0,
        isCover: true,
        expectedSourceSizeBytes: 3,
        expectedContentType: "image/jpeg",
        sourceSha256: null,
        publicSizeBytes: null,
        publicSha256: null,
        publicEtag: null,
        publicUrl: null,
        objectCreatedByAttemptToken: null,
        ...itemOverrides,
      },
    ],
  };
}

function cleanupClaimed(): ClaimedProductActivationCleanup {
  return {
    result: "claimed",
    phase: "post_switch_cleanup",
    ...payload,
    submissionId: uuid(2),
    productId: uuid(3),
    sellerId: uuid(4),
    attemptCount: 2,
    attemptToken: uuid(7),
    cleanupItems: [
      {
        destinationKey: "products/cleanup.jpg",
        cleanupKind: "superseded_public",
        expectedSizeBytes: 3,
        expectedSha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
        expectedEtag: '"etag"',
      },
    ],
  };
}

function object(bytes: number[]): ProductPublicationObject {
  return {
    bytes: Uint8Array.from(bytes),
    contentType: "image/jpeg",
    etag: '"etag"',
  };
}

function config(): ProductActivationConfig {
  return {
    dispatchMode: "local",
    maximumImageCount: 20,
    itemConcurrency: 3,
    itemTimeoutMs: 30_000,
    workerDeadlineMs: 240_000,
    claimTimeoutSeconds: 360,
    supabaseUrl: "http://127.0.0.1:54321",
    serviceRoleKey: "service-role",
    recoveryIntervalMs: 30_000,
    recoveryBatchSize: 25,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
