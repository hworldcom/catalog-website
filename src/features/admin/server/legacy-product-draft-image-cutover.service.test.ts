import { describe, expect, it, vi } from "vitest";

import { ClassifierImportError } from "./classifier-import.types";
import type { LegacyProductDraftImageCutoverRepository } from "./legacy-product-draft-image-cutover.repository";
import { LegacyProductDraftImageCutoverService } from "./legacy-product-draft-image-cutover.service";
import {
  type LegacyProductDraftImageCutoverErrorCode,
  type LegacyProductDraftImageReconciliationWorkItem,
  PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
  PRODUCT_DRAFT_IMAGE_RECONCILIATION_DEADLINE_MS,
  type ProductDraftImageCutoverScanPhase,
  type ProductDraftImageCutoverSummary,
  type ProductDraftImagePublicObjectState,
  type ProductDraftImageStorageCutover,
} from "./legacy-product-draft-image-cutover.types";
import {
  buildDestinationMetadata,
  type ClassifierImageObjectMetadata,
  type DestinationImageStorage,
  type DestinationObject,
  type DestinationObjectInfo,
  PRODUCT_DRAFT_IMAGE_BUCKET,
  PRODUCT_IMAGE_BUCKET,
  type ProductImageStorageBucket,
} from "./destination-image-storage";

type MemoryReconciliation = {
  item: LegacyProductDraftImageReconciliationWorkItem;
  status: "pending" | "started" | "completed" | "failed";
  errorCode: LegacyProductDraftImageCutoverErrorCode | null;
  retryable: boolean;
  releaseBlocking: boolean;
  publicObjectState: ProductDraftImagePublicObjectState;
  setPrivateBucket: boolean;
};

const cutoverToken = "00000000-0000-0000-0000-000000000090";
const reconciliationToken = "00000000-0000-0000-0000-000000000091";
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function workItem(index = 1): LegacyProductDraftImageReconciliationWorkItem {
  const suffix = String(index).padStart(12, "0");
  return {
    destinationKey: `product-drafts/00000000-0000-0000-0000-000000000050/images/00000000-0000-0000-0000-${suffix}.jpg`,
    productDraftImageId: `10000000-0000-0000-0000-${suffix}`,
    reconciliationStatus: "started",
    publicObjectState: "unchecked",
    attemptCount: 0,
    attemptToken: reconciliationToken,
    imageStatus: "available",
    storageBucket: PRODUCT_IMAGE_BUCKET,
    contentType: "image/jpeg",
    sizeBytes: bytes.byteLength,
    classifierOrganizationId: "00000000-0000-0000-0000-000000000001",
    classifierBatchId: "00000000-0000-0000-0000-000000000010",
    classifierGroupId: "00000000-0000-0000-0000-000000000020",
    classifierImageId: `00000000-0000-0000-0000-${suffix}`,
    sourceContentLength: bytes.byteLength,
  };
}

function expectedInfo(item: LegacyProductDraftImageReconciliationWorkItem): DestinationObjectInfo {
  return {
    contentType: "image/jpeg",
    sizeBytes: bytes.byteLength,
    metadata: buildDestinationMetadata({
      classifierOrganizationId: item.classifierOrganizationId!,
      classifierBatchId: item.classifierBatchId!,
      classifierGroupId: item.classifierGroupId!,
      classifierImageId: item.classifierImageId!,
      sourceContentLength: bytes.byteLength,
    }),
  };
}

class MemoryStorage implements DestinationImageStorage {
  readonly objects = new Map<string, { object: DestinationObject; info: DestinationObjectInfo }>();
  writes = 0;
  deletes = 0;
  activeWrites = 0;
  maximumActiveWrites = 0;
  writeDelayMs = 0;
  deleteFailure = false;
  infoFailure = false;
  afterCreate: (() => void) | undefined;

  async getInfo(
    bucket: ProductImageStorageBucket,
    key: string,
  ): Promise<DestinationObjectInfo | null> {
    if (this.infoFailure) {
      throw new ClassifierImportError("destination_storage_unavailable", true);
    }
    return this.objects.get(this.mapKey(bucket, key))?.info ?? null;
  }

  async read(bucket: ProductImageStorageBucket, key: string): Promise<DestinationObject | null> {
    return this.objects.get(this.mapKey(bucket, key))?.object ?? null;
  }

  async createOnly(input: {
    storageBucket: ProductImageStorageBucket;
    destinationKey: string;
    bytes: Uint8Array;
    contentType: "image/jpeg";
    metadata: ClassifierImageObjectMetadata;
  }): Promise<"created" | "already_exists"> {
    const key = this.mapKey(input.storageBucket, input.destinationKey);
    if (this.objects.has(key)) return "already_exists";
    this.activeWrites += 1;
    this.maximumActiveWrites = Math.max(this.maximumActiveWrites, this.activeWrites);
    if (this.writeDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.writeDelayMs));
    }
    this.objects.set(key, {
      object: { bytes: input.bytes, contentType: input.contentType },
      info: {
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
        metadata: input.metadata,
      },
    });
    this.activeWrites -= 1;
    this.writes += 1;
    this.afterCreate?.();
    return "created";
  }

  async delete(bucket: ProductImageStorageBucket, key: string): Promise<void> {
    if (this.deleteFailure) {
      throw new ClassifierImportError("destination_storage_unavailable", true);
    }
    this.objects.delete(this.mapKey(bucket, key));
    this.deletes += 1;
  }

  put(
    bucket: ProductImageStorageBucket,
    key: string,
    object: DestinationObject,
    info: DestinationObjectInfo,
  ): void {
    this.objects.set(this.mapKey(bucket, key), { object, info });
  }

  has(bucket: ProductImageStorageBucket, key: string): boolean {
    return this.objects.has(this.mapKey(bucket, key));
  }

  publicDraftKeys(): string[] {
    const prefix = `${PRODUCT_IMAGE_BUCKET}:product-drafts/`;
    return [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(`${PRODUCT_IMAGE_BUCKET}:`.length))
      .sort();
  }

  private mapKey(bucket: ProductImageStorageBucket, key: string): string {
    return `${bucket}:${key}`;
  }
}

class MemoryRepository implements LegacyProductDraftImageCutoverRepository {
  cutover = cutoverRow();
  claimOwned = true;
  readonly rows: MemoryReconciliation[];
  readonly bucketUpdates: string[] = [];
  readonly listedCursors: Array<string | null> = [];
  readonly enteredScanPhases: ProductDraftImageCutoverScanPhase[] = [];
  private readonly scanFailures = new Map<string, LegacyProductDraftImageCutoverErrorCode>();

  constructor(
    items: LegacyProductDraftImageReconciliationWorkItem[],
    private readonly listStorageKeys: () => string[],
  ) {
    this.rows = items.map((item) => ({
      item: { ...item },
      status: "pending",
      errorCode: null,
      retryable: false,
      releaseBlocking: false,
      publicObjectState: "unchecked",
      setPrivateBucket: false,
    }));
  }

  async claimCutover(): Promise<ProductDraftImageStorageCutover | null> {
    if (!this.claimOwned || this.cutover.status === "completed") return null;
    this.cutover.status = "running";
    this.cutover.attempt_count += 1;
    this.cutover.attempt_token = cutoverToken;
    this.cutover.claim_started_at = "2026-07-24T10:00:00Z";
    this.cutover.last_attempt_at = "2026-07-24T10:00:00Z";
    this.cutover.scan_phase = this.rows.some((row) => row.status === "pending")
      ? "reconciliation"
      : "discovery";
    this.cutover.scan_cursor = null;
    return { ...this.refresh() };
  }

  async heartbeat(): Promise<boolean> {
    return this.claimOwned && this.cutover.status === "running";
  }

  async getSummary(): Promise<ProductDraftImageCutoverSummary> {
    const failuresByCode: Record<string, number> = {};
    for (const row of this.rows) {
      if (row.status === "failed" && row.errorCode) {
        failuresByCode[row.errorCode] = (failuresByCode[row.errorCode] ?? 0) + 1;
      }
    }
    for (const code of this.scanFailures.values()) {
      failuresByCode[code] = (failuresByCode[code] ?? 0) + 1;
    }
    return { cutover: { ...this.refresh() }, failuresByCode };
  }

  async claimNextReconciliation(): Promise<LegacyProductDraftImageReconciliationWorkItem | null> {
    if (!this.claimOwned) return null;
    const selected = this.rows.find((row) => row.status === "pending");
    if (!selected) return null;
    selected.status = "started";
    selected.item.reconciliationStatus = "started";
    selected.item.attemptCount += 1;
    selected.item.attemptToken = `${reconciliationToken.slice(0, -1)}${selected.item.attemptCount}`;
    return { ...selected.item };
  }

  async verifyReconciliationClaim(): Promise<boolean> {
    return this.claimOwned;
  }

  async finalizeReconciliation(
    input: Parameters<LegacyProductDraftImageCutoverRepository["finalizeReconciliation"]>[0],
  ): Promise<boolean> {
    if (!this.claimOwned) return false;
    const selected = this.rows.find((row) => row.item.destinationKey === input.destinationKey);
    if (!selected || selected.status !== "started") return false;
    selected.status = input.status;
    selected.errorCode = input.errorCode;
    selected.retryable = input.retryable;
    selected.releaseBlocking = input.releaseBlocking;
    selected.publicObjectState = input.publicObjectState;
    selected.setPrivateBucket = input.setPrivateBucket;
    if (input.setPrivateBucket) this.bucketUpdates.push(input.destinationKey);
    return true;
  }

  async listPublicObjectKeys(cursor: string | null, limit: number): Promise<string[]> {
    this.listedCursors.push(cursor);
    return this.listStorageKeys()
      .filter((key) => cursor === null || key > cursor)
      .slice(0, limit);
  }

  async recordScanObject(input: {
    destinationKey: string;
  }): Promise<LegacyProductDraftImageCutoverErrorCode | "claim_lost"> {
    if (!this.claimOwned) return "claim_lost";
    const represented = this.rows.some((row) => row.item.destinationKey === input.destinationKey);
    const code = represented ? "legacy_public_delete_failed" : "legacy_destination_unowned";
    this.scanFailures.set(input.destinationKey, code);
    return code;
  }

  async setScanProgress(
    input: Parameters<LegacyProductDraftImageCutoverRepository["setScanProgress"]>[0],
  ): Promise<boolean> {
    if (!this.claimOwned || this.cutover.scan_phase !== input.scanPhase) return false;
    this.cutover.scan_cursor = input.nextCursor;
    return true;
  }

  async beginScanPhase(
    input: Parameters<LegacyProductDraftImageCutoverRepository["beginScanPhase"]>[0],
  ): Promise<boolean> {
    if (!this.claimOwned || this.cutover.scan_phase !== input.expectedPhase) return false;
    this.cutover.scan_phase = input.nextPhase;
    this.cutover.scan_cursor = null;
    this.enteredScanPhases.push(input.nextPhase);
    return true;
  }

  async failCutover(
    _version: string,
    _attemptToken: string,
    errorCode: LegacyProductDraftImageCutoverErrorCode,
  ): Promise<boolean> {
    if (!this.claimOwned) return false;
    this.cutover.status = "failed";
    this.cutover.error_code = errorCode;
    this.cutover.attempt_token = null;
    this.cutover.claim_started_at = null;
    return true;
  }

  async completeCutover(): Promise<boolean> {
    if (!this.claimOwned || this.listStorageKeys().length > 0) return false;
    this.cutover.status = "completed";
    this.cutover.error_code = null;
    this.cutover.attempt_token = null;
    this.cutover.claim_started_at = null;
    this.cutover.scan_cursor = null;
    this.cutover.completed_at = "2026-07-24T10:10:00Z";
    return true;
  }

  private refresh(): ProductDraftImageStorageCutover {
    this.cutover.pending_count = this.rows.filter((row) => row.status === "pending").length;
    this.cutover.started_count = this.rows.filter((row) => row.status === "started").length;
    this.cutover.completed_count = this.rows.filter((row) => row.status === "completed").length;
    this.cutover.failed_count =
      this.rows.filter((row) => row.status === "failed").length + this.scanFailures.size;
    this.cutover.release_blocking_count =
      this.rows.filter((row) => row.releaseBlocking).length + this.scanFailures.size;
    return this.cutover;
  }
}

function cutoverRow(
  overrides: Partial<ProductDraftImageStorageCutover> = {},
): ProductDraftImageStorageCutover {
  return {
    version: PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
    status: "pending",
    scan_phase: "reconciliation",
    attempt_count: 0,
    attempt_token: null,
    claim_started_at: null,
    last_attempt_at: null,
    scan_cursor: null,
    pending_count: 0,
    started_count: 0,
    completed_count: 0,
    failed_count: 0,
    release_blocking_count: 0,
    error_code: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T10:00:00Z",
    updated_at: "2026-07-24T10:00:00Z",
    ...overrides,
  };
}

function putValidPublicObject(
  storage: MemoryStorage,
  item: LegacyProductDraftImageReconciliationWorkItem,
): void {
  storage.put(
    PRODUCT_IMAGE_BUCKET,
    item.destinationKey,
    { bytes, contentType: "image/jpeg" },
    expectedInfo(item),
  );
}

describe("LegacyProductDraftImageCutoverService", () => {
  it("copies, verifies, and deletes a valid legacy public object", async () => {
    const item = workItem();
    const storage = new MemoryStorage();
    putValidPublicObject(storage, item);
    const repository = new MemoryRepository([item], () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(50);

    expect(result.status).toBe("completed");
    expect(storage.has(PRODUCT_IMAGE_BUCKET, item.destinationKey)).toBe(false);
    expect(storage.has(PRODUCT_DRAFT_IMAGE_BUCKET, item.destinationKey)).toBe(true);
    expect(storage.writes).toBe(1);
    expect(storage.deletes).toBe(1);
    expect(repository.bucketUpdates).toEqual([item.destinationKey]);
    expect(repository.rows[0]).toMatchObject({
      status: "completed",
      publicObjectState: "deleted",
      releaseBlocking: false,
    });
  });

  it("records missing bytes for an available row without blocking cutover", async () => {
    const item = workItem();
    const storage = new MemoryStorage();
    const repository = new MemoryRepository([item], () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(50);

    expect(result.status).toBe("completed");
    expect(result.summary.cutover.failed_count).toBe(1);
    expect(result.summary.cutover.release_blocking_count).toBe(0);
    expect(repository.rows[0]).toMatchObject({
      status: "failed",
      errorCode: "legacy_source_missing",
      publicObjectState: "absent",
      setPrivateBucket: true,
    });
  });

  it("retains and blocks a conflicting public object", async () => {
    const item = workItem();
    const storage = new MemoryStorage();
    storage.put(
      PRODUCT_IMAGE_BUCKET,
      item.destinationKey,
      { bytes, contentType: "image/jpeg" },
      { ...expectedInfo(item), sizeBytes: bytes.byteLength + 1 },
    );
    const repository = new MemoryRepository([item], () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(50);

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "legacy_source_conflict",
    });
    expect(storage.has(PRODUCT_IMAGE_BUCKET, item.destinationKey)).toBe(true);
    expect(storage.has(PRODUCT_DRAFT_IMAGE_BUCKET, item.destinationKey)).toBe(false);
    expect(repository.rows[0]).toMatchObject({
      status: "failed",
      releaseBlocking: true,
      publicObjectState: "unresolved",
    });
  });

  it("retains both objects and blocks when the private object conflicts", async () => {
    const item = workItem();
    const storage = new MemoryStorage();
    putValidPublicObject(storage, item);
    storage.put(
      PRODUCT_DRAFT_IMAGE_BUCKET,
      item.destinationKey,
      { bytes, contentType: "image/jpeg" },
      { ...expectedInfo(item), sizeBytes: bytes.byteLength + 1 },
    );
    const repository = new MemoryRepository([item], () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(50);

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "legacy_private_object_conflict",
    });
    expect(storage.has(PRODUCT_IMAGE_BUCKET, item.destinationKey)).toBe(true);
    expect(storage.has(PRODUCT_DRAFT_IMAGE_BUCKET, item.destinationKey)).toBe(true);
    expect(storage.deletes).toBe(0);
    expect(repository.rows[0]).toMatchObject({
      status: "failed",
      releaseBlocking: true,
      publicObjectState: "unresolved",
    });
  });

  it("blocks a public object whose expected classifier metadata is unavailable", async () => {
    const item = { ...workItem(), sourceContentLength: null };
    const storage = new MemoryStorage();
    putValidPublicObject(storage, item);
    const repository = new MemoryRepository([item], () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(50);

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "legacy_object_unverifiable",
    });
    expect(storage.has(PRODUCT_IMAGE_BUCKET, item.destinationKey)).toBe(true);
    expect(repository.rows[0]).toMatchObject({
      status: "failed",
      retryable: false,
      releaseBlocking: true,
    });
  });

  it("records transient storage failures as retryable and release-blocking", async () => {
    const item = workItem();
    const storage = new MemoryStorage();
    storage.infoFailure = true;
    const repository = new MemoryRepository([item], () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(50);

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "legacy_storage_unavailable",
    });
    expect(repository.rows[0]).toMatchObject({
      status: "failed",
      errorCode: "legacy_storage_unavailable",
      retryable: true,
      releaseBlocking: true,
      publicObjectState: "unchecked",
    });
  });

  it("aborts a row at its execution deadline and records a retryable failure", async () => {
    vi.useFakeTimers();
    try {
      const item = workItem();
      const storage = new MemoryStorage();
      storage.getInfo = async (_bucket, _key, signal) =>
        await new Promise<DestinationObjectInfo | null>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
      const repository = new MemoryRepository([item], () => storage.publicDraftKeys());

      const pending = new LegacyProductDraftImageCutoverService(repository, storage).run(50);
      await vi.advanceTimersByTimeAsync(PRODUCT_DRAFT_IMAGE_RECONCILIATION_DEADLINE_MS);
      const result = await pending;

      expect(result).toMatchObject({
        status: "failed",
        errorCode: "legacy_storage_unavailable",
      });
      expect(repository.rows[0]).toMatchObject({
        status: "failed",
        retryable: true,
        releaseBlocking: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the verified private copy and retries a failed public deletion", async () => {
    const item = workItem();
    const storage = new MemoryStorage();
    putValidPublicObject(storage, item);
    storage.deleteFailure = true;
    const repository = new MemoryRepository([item], () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(50);

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "legacy_public_delete_failed",
    });
    expect(storage.has(PRODUCT_IMAGE_BUCKET, item.destinationKey)).toBe(true);
    expect(storage.has(PRODUCT_DRAFT_IMAGE_BUCKET, item.destinationKey)).toBe(true);
    expect(repository.rows[0]).toMatchObject({
      status: "failed",
      retryable: true,
      releaseBlocking: true,
      publicObjectState: "unresolved",
    });
  });

  it("discards late work after losing the reconciliation claim", async () => {
    const item = workItem();
    const storage = new MemoryStorage();
    putValidPublicObject(storage, item);
    const repository = new MemoryRepository([item], () => storage.publicDraftKeys());
    storage.afterCreate = () => {
      repository.claimOwned = false;
    };

    await expect(
      new LegacyProductDraftImageCutoverService(repository, storage).run(50),
    ).rejects.toThrow("cutover claim was lost");

    expect(storage.has(PRODUCT_IMAGE_BUCKET, item.destinationKey)).toBe(true);
    expect(storage.has(PRODUCT_DRAFT_IMAGE_BUCKET, item.destinationKey)).toBe(true);
    expect(storage.deletes).toBe(0);
    expect(repository.rows[0]?.status).toBe("started");
  });

  it("uses a fresh confirming scan before completing the cutover", async () => {
    const item = workItem();
    const storage = new MemoryStorage();
    const repository = new MemoryRepository([item], () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(50);

    expect(result.status).toBe("completed");
    expect(repository.enteredScanPhases).toEqual(["discovery", "confirming"]);
    expect(repository.listedCursors).toEqual([null, null]);
  });

  it("finds an unowned public object during the final keyset scan", async () => {
    const storage = new MemoryStorage();
    const unowned = "product-drafts/unowned/images/image.jpg";
    storage.put(
      PRODUCT_IMAGE_BUCKET,
      unowned,
      { bytes, contentType: "image/jpeg" },
      { contentType: "image/jpeg", sizeBytes: bytes.byteLength, metadata: {} },
    );
    const repository = new MemoryRepository([], () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(50);

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "legacy_destination_unowned",
    });
    expect(result.summary.cutover.release_blocking_count).toBe(1);
    expect(storage.has(PRODUCT_IMAGE_BUCKET, unowned)).toBe(true);
  });

  it("uses lexicographic keyset pagination for the public-prefix scan", async () => {
    const storage = new MemoryStorage();
    const keys = [
      "product-drafts/unowned/images/a.jpg",
      "product-drafts/unowned/images/b.jpg",
      "product-drafts/unowned/images/c.jpg",
    ];
    for (const key of keys) {
      storage.put(
        PRODUCT_IMAGE_BUCKET,
        key,
        { bytes, contentType: "image/jpeg" },
        { contentType: "image/jpeg", sizeBytes: bytes.byteLength, metadata: {} },
      );
    }
    const repository = new MemoryRepository([], () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(2);

    expect(result.status).toBe("failed");
    expect(repository.listedCursors).toEqual([null, keys[1], keys[2]]);
    expect(result.summary.cutover.release_blocking_count).toBe(3);
  });

  it("never runs more than five object copies concurrently", async () => {
    const items = Array.from({ length: 8 }, (_, index) => workItem(index + 1));
    const storage = new MemoryStorage();
    storage.writeDelayMs = 5;
    for (const item of items) putValidPublicObject(storage, item);
    const repository = new MemoryRepository(items, () => storage.publicDraftKeys());

    const result = await new LegacyProductDraftImageCutoverService(repository, storage).run(100);

    expect(result.status).toBe("completed");
    expect(storage.maximumActiveWrites).toBeGreaterThan(1);
    expect(storage.maximumActiveWrites).toBeLessThanOrEqual(5);
    expect(storage.writes).toBe(8);
  });
});
