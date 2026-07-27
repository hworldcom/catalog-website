import { describe, expect, it } from "vitest";

import type { ClassifierImportConfig } from "./classifier-import.config";
import type {
  ClassifierImagePromotionRepository,
  PreparePromotionGroupResult,
  PromotionWorkItem,
} from "./classifier-image-promotion.repository";
import { ClassifierImagePromotionService } from "./classifier-image-promotion.service";
import type {
  NormalizedClassifierImage,
  NormalizedClassifierImageReader,
} from "./classifier-normalized-image.service";
import type {
  ApprovedGroup,
  ClassifierImportRun,
  ImageImportActionState,
} from "./classifier-import.types";
import { ClassifierImportClaimLostError } from "./classifier-import.types";
import {
  buildDestinationMetadata,
  type DestinationObject,
  type DestinationImageStorage,
  type DestinationObjectInfo,
  PRODUCT_DRAFT_IMAGE_BUCKET,
  PRODUCT_IMAGE_BUCKET,
  type ProductImageStorageBucket,
} from "./destination-image-storage";

const config: ClassifierImportConfig = {
  classifierApiBaseUrl: "http://classifier.test",
  approvedGroupsTimeoutMs: 30_000,
  importRunLeaseTimeoutSeconds: 900,
  normalizedImageReadTimeoutMs: 30_000,
  storageHeadTimeoutMs: 15_000,
  storageWriteTimeoutMs: 60_000,
  imagePromotionClaimTimeoutSeconds: 300,
  workerPollIntervalMs: 5_000,
  dispatchMode: "local",
  classifierOrganizationId: "00000000-0000-0000-0000-000000000001",
};

const sellerId = "00000000-0000-0000-0000-000000000002";

const run: ClassifierImportRun = {
  id: "00000000-0000-0000-0000-000000000010",
  classifier_organization_id: config.classifierOrganizationId,
  classifier_batch_id: "00000000-0000-0000-0000-000000000011",
  seller_id: sellerId,
  pipeline_version: "pipeline",
  status: "running",
  operation_kind: "import",
  requested_by_user_id: null,
  attempt_count: 1,
  attempt_token: "00000000-0000-0000-0000-000000000012",
  claim_started_at: "2026-07-19T00:00:00Z",
  last_heartbeat_at: "2026-07-19T00:00:00Z",
  error_code: null,
  retryable: false,
  retry_policy: "retryable_only",
  created_at: "2026-07-19T00:00:00Z",
  completed_at: null,
  updated_at: "2026-07-19T00:00:00Z",
};

const group: ApprovedGroup = {
  groupId: "00000000-0000-0000-0000-000000000020",
  approvedCategorySlug: "fashion",
  suggestedCategorySlug: null,
  coverImageId: "00000000-0000-0000-0000-000000000030",
  confidence: 0.95,
  images: [
    {
      imageId: "00000000-0000-0000-0000-000000000030",
      position: 0,
      isDuplicate: false,
      duplicateOfImageId: null,
    },
    {
      imageId: "00000000-0000-0000-0000-000000000031",
      position: 1,
      isDuplicate: true,
      duplicateOfImageId: "00000000-0000-0000-0000-000000000030",
    },
  ],
};

const image: NormalizedClassifierImage = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  contentType: "image/jpeg",
  contentLength: 4,
};

function promotion(overrides: Partial<PromotionWorkItem> = {}): PromotionWorkItem {
  return {
    id: "00000000-0000-0000-0000-000000000040",
    product_draft_id: "00000000-0000-0000-0000-000000000050",
    product_draft_image_id: "00000000-0000-0000-0000-000000000051",
    classifier_organization_id: run.classifier_organization_id,
    classifier_batch_id: run.classifier_batch_id,
    classifier_group_id: group.groupId,
    classifier_image_id: group.coverImageId,
    is_source_cover: true,
    status: "pending",
    source_content_length: null,
    destination_size_bytes: null,
    attempt_count: 0,
    attempt_token: null,
    claim_started_at: null,
    last_attempt_at: null,
    error_code: null,
    retryable: false,
    promoted_at: null,
    created_at: "2026-07-19T00:00:00Z",
    updated_at: "2026-07-19T00:00:00Z",
    destinationKey:
      "product-drafts/00000000-0000-0000-0000-000000000050/images/00000000-0000-0000-0000-000000000030.jpg",
    sourcePosition: 0,
    storageBucket: PRODUCT_DRAFT_IMAGE_BUCKET,
    ...overrides,
  };
}

class MemoryPromotionRepository implements ClassifierImagePromotionRepository {
  claimAllowed = true;
  verifyAllowed = true;
  heartbeatAllowed = true;
  readonly claimedPromotionIds: string[] = [];
  prepareResult: PreparePromotionGroupResult = {
    result: "prepared",
    productDraftId: "00000000-0000-0000-0000-000000000050",
  };

  constructor(public promotions: PromotionWorkItem[]) {}

  async prepareGroup(): Promise<PreparePromotionGroupResult> {
    return this.prepareResult;
  }

  async listGroupPromotions(): Promise<PromotionWorkItem[]> {
    return this.promotions.map((row) => ({ ...row }));
  }

  async listPromotedRunImages(): Promise<PromotionWorkItem[]> {
    return this.promotions.filter((row) => row.status === "promoted").map((row) => ({ ...row }));
  }

  async claimPromotion(input: { promotionId: string }): Promise<PromotionWorkItem | null> {
    this.claimedPromotionIds.push(input.promotionId);
    if (!this.claimAllowed) return null;
    const selected = this.promotions.find((row) => row.id === input.promotionId);
    if (!selected) return null;
    selected.status = "started";
    selected.attempt_count += 1;
    selected.attempt_token = "00000000-0000-0000-0000-000000000060";
    selected.claim_started_at = "2026-07-19T00:01:00Z";
    selected.error_code = null;
    selected.retryable = false;
    return { ...selected };
  }

  async verifyClaim(): Promise<boolean> {
    return this.verifyAllowed;
  }

  async heartbeatRun(): Promise<boolean> {
    return this.heartbeatAllowed;
  }

  async setSourceContentLength(input: {
    promotionId: string;
    sourceContentLength: number;
  }): Promise<boolean> {
    const selected = this.promotions.find((row) => row.id === input.promotionId);
    if (!selected || !this.claimAllowed) return false;
    selected.source_content_length = input.sourceContentLength;
    return true;
  }

  async finalizeSuccess(input: {
    promotionId: string;
    destinationSizeBytes: number;
  }): Promise<boolean> {
    const selected = this.promotions.find((row) => row.id === input.promotionId);
    if (!selected || !this.claimAllowed) return false;
    selected.status = "promoted";
    selected.destination_size_bytes = input.destinationSizeBytes;
    selected.attempt_token = null;
    selected.claim_started_at = null;
    selected.promoted_at = "2026-07-19T00:02:00Z";
    return true;
  }

  async finalizeFailure(input: {
    promotionId: string;
    errorCode: string;
    retryable: boolean;
  }): Promise<boolean> {
    const selected = this.promotions.find((row) => row.id === input.promotionId);
    if (!selected || !this.claimAllowed) return false;
    selected.status = "failed";
    selected.error_code = input.errorCode;
    selected.retryable = input.retryable;
    selected.attempt_token = null;
    selected.claim_started_at = null;
    return true;
  }

  async getActionState(): Promise<ImageImportActionState> {
    return {
      hasRetryableFailures: this.promotions.some((row) => row.status === "failed" && row.retryable),
      hasAnyFailures: this.promotions.some((row) => row.status === "failed"),
      hasPromotedImages: this.promotions.some((row) => row.status === "promoted"),
    };
  }

  async resetMissing(input: { promotionId: string }): Promise<boolean> {
    const selected = this.promotions.find((row) => row.id === input.promotionId);
    if (!selected || !this.heartbeatAllowed) return false;
    selected.status = "pending";
    selected.destination_size_bytes = null;
    selected.promoted_at = null;
    return true;
  }

  async markConflict(input: { promotionId: string }): Promise<boolean> {
    const selected = this.promotions.find((row) => row.id === input.promotionId);
    if (!selected || !this.heartbeatAllowed) return false;
    selected.status = "failed";
    selected.error_code = "destination_object_conflict";
    selected.retryable = false;
    selected.destination_size_bytes = null;
    selected.promoted_at = null;
    return true;
  }
}

class MemoryStorage implements DestinationImageStorage {
  readonly objects = new Map<string, DestinationObjectInfo>();
  readonly reads: { storageBucket: ProductImageStorageBucket; destinationKey: string }[] = [];
  readonly writesTo: ProductImageStorageBucket[] = [];
  writes = 0;

  async getInfo(
    storageBucket: ProductImageStorageBucket,
    destinationKey: string,
  ): Promise<DestinationObjectInfo | null> {
    this.reads.push({ storageBucket, destinationKey });
    return this.objects.get(this.objectKey(storageBucket, destinationKey)) ?? null;
  }

  async createOnly(input: {
    storageBucket: ProductImageStorageBucket;
    destinationKey: string;
    bytes: Uint8Array;
    contentType: "image/jpeg";
    metadata: ReturnType<typeof buildDestinationMetadata>;
  }): Promise<"created" | "already_exists"> {
    const key = this.objectKey(input.storageBucket, input.destinationKey);
    if (this.objects.has(key)) return "already_exists";
    this.writes += 1;
    this.writesTo.push(input.storageBucket);
    this.objects.set(key, {
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
      metadata: input.metadata,
    });
    return "created";
  }

  async read(
    storageBucket: ProductImageStorageBucket,
    destinationKey: string,
  ): Promise<DestinationObject | null> {
    const info = this.objects.get(this.objectKey(storageBucket, destinationKey));
    if (!info?.sizeBytes) return null;
    return {
      bytes: new Uint8Array(info.sizeBytes),
      contentType: info.contentType,
    };
  }

  async delete(storageBucket: ProductImageStorageBucket, destinationKey: string): Promise<void> {
    this.objects.delete(this.objectKey(storageBucket, destinationKey));
  }

  setObject(row: PromotionWorkItem, info: DestinationObjectInfo): void {
    this.objects.set(this.objectKey(row.storageBucket, row.destinationKey), info);
  }

  private objectKey(storageBucket: ProductImageStorageBucket, destinationKey: string): string {
    return `${storageBucket}:${destinationKey}`;
  }
}

const reader: NormalizedClassifierImageReader = {
  readNormalizedImage: async () => image,
};

function expectedInfo(row: PromotionWorkItem): DestinationObjectInfo {
  return {
    contentType: "image/jpeg",
    sizeBytes: image.contentLength,
    metadata: buildDestinationMetadata({
      classifierOrganizationId: row.classifier_organization_id,
      classifierBatchId: row.classifier_batch_id,
      classifierGroupId: row.classifier_group_id,
      classifierImageId: row.classifier_image_id,
      sourceContentLength: image.contentLength,
    }),
  };
}

describe("ClassifierImagePromotionService", () => {
  it("leaves a retryable failed promotion terminal until explicit retry", async () => {
    const failed = promotion({
      status: "failed",
      attempt_count: 1,
      error_code: "destination_storage_unavailable",
      retryable: true,
    });
    const failedBeforeAttempt = { ...failed };
    const repository = new MemoryPromotionRepository([failed]);
    const storage = new MemoryStorage();
    const service = new ClassifierImagePromotionService(repository, reader, storage, config);

    await expect(service.prepareGroupImages(run, run.attempt_token!, group)).resolves.toEqual({
      status: "failed",
      errorCode: "destination_storage_unavailable",
      retryable: true,
    });
    await expect(service.getImageImportActionState(run.id)).resolves.toEqual({
      hasRetryableFailures: true,
      hasAnyFailures: true,
      hasPromotedImages: false,
    });
    expect(repository.claimedPromotionIds).toEqual([]);
    expect(repository.promotions[0]).toEqual(failedBeforeAttempt);
    expect(storage.writes).toBe(0);
  });

  it("promotes a required image and completes its group", async () => {
    const row = promotion();
    const repository = new MemoryPromotionRepository([row]);
    const storage = new MemoryStorage();
    const service = new ClassifierImagePromotionService(repository, reader, storage, config);

    await expect(service.prepareGroupImages(run, run.attempt_token!, group)).resolves.toEqual({
      status: "complete",
    });
    expect(repository.promotions[0]).toMatchObject({
      status: "promoted",
      source_content_length: 4,
      destination_size_bytes: 4,
    });
    expect(storage.writes).toBe(1);
    expect(storage.writesTo).toEqual([PRODUCT_DRAFT_IMAGE_BUCKET]);
  });

  it("recovers an existing matching object without writing again", async () => {
    const row = promotion();
    const repository = new MemoryPromotionRepository([row]);
    const storage = new MemoryStorage();
    storage.setObject(row, expectedInfo(row));
    const service = new ClassifierImagePromotionService(repository, reader, storage, config);

    await expect(service.prepareGroupImages(run, run.attempt_token!, group)).resolves.toEqual({
      status: "complete",
    });
    expect(storage.writes).toBe(0);
    expect(repository.promotions[0]?.status).toBe("promoted");
    expect(storage.reads.every((read) => read.storageBucket === PRODUCT_DRAFT_IMAGE_BUCKET)).toBe(
      true,
    );
  });

  it("never overwrites an existing conflicting object", async () => {
    const row = promotion();
    const repository = new MemoryPromotionRepository([row]);
    const storage = new MemoryStorage();
    storage.setObject(row, {
      ...expectedInfo(row),
      sizeBytes: 999,
    });
    const service = new ClassifierImagePromotionService(repository, reader, storage, config);

    await expect(service.prepareGroupImages(run, run.attempt_token!, group)).resolves.toEqual({
      status: "failed",
      errorCode: "destination_object_conflict",
      retryable: false,
    });
    expect(storage.writes).toBe(0);
  });

  it("writes an explicitly retried legacy failure only to its backfilled private bucket", async () => {
    const retried = promotion({
      status: "pending",
      attempt_count: 1,
      storageBucket: PRODUCT_DRAFT_IMAGE_BUCKET,
    });
    const repository = new MemoryPromotionRepository([retried]);
    const storage = new MemoryStorage();
    const service = new ClassifierImagePromotionService(repository, reader, storage, config);

    await expect(service.prepareGroupImages(run, run.attempt_token!, group)).resolves.toEqual({
      status: "complete",
    });

    expect(storage.writes).toBe(1);
    expect(storage.writesTo).toEqual([PRODUCT_DRAFT_IMAGE_BUCKET]);
    expect(storage.objects.has(`${PRODUCT_IMAGE_BUCKET}:${retried.destinationKey}`)).toBe(false);
  });

  it("discards work after losing the promotion claim", async () => {
    const repository = new MemoryPromotionRepository([promotion()]);
    repository.verifyAllowed = false;
    const service = new ClassifierImagePromotionService(
      repository,
      reader,
      new MemoryStorage(),
      config,
    );

    await expect(service.prepareGroupImages(run, run.attempt_token!, group)).rejects.toBeInstanceOf(
      ClassifierImportClaimLostError,
    );
  });

  it("reports missing and conflicting objects independently during reconciliation", async () => {
    const missing = promotion({
      status: "promoted",
      source_content_length: 4,
      destination_size_bytes: 4,
      promoted_at: "2026-07-19T00:02:00Z",
    });
    const conflicting = promotion({
      id: "00000000-0000-0000-0000-000000000041",
      classifier_group_id: "00000000-0000-0000-0000-000000000021",
      classifier_image_id: "00000000-0000-0000-0000-000000000032",
      product_draft_id: "00000000-0000-0000-0000-000000000052",
      product_draft_image_id: "00000000-0000-0000-0000-000000000053",
      destinationKey:
        "product-drafts/00000000-0000-0000-0000-000000000052/images/00000000-0000-0000-0000-000000000032.jpg",
      storageBucket: PRODUCT_IMAGE_BUCKET,
      status: "promoted",
      source_content_length: 4,
      destination_size_bytes: 4,
      promoted_at: "2026-07-19T00:02:00Z",
    });
    const repository = new MemoryPromotionRepository([missing, conflicting]);
    const storage = new MemoryStorage();
    storage.setObject(conflicting, {
      ...expectedInfo(conflicting),
      metadata: {},
    });
    const service = new ClassifierImagePromotionService(repository, reader, storage, config);

    await expect(
      service.reconcilePromotedImages({ ...run, operation_kind: "reconcile" }, run.attempt_token!),
    ).resolves.toEqual({
      missingGroupIds: new Set([missing.classifier_group_id]),
      conflictingGroupIds: new Set([conflicting.classifier_group_id]),
    });
    expect(repository.promotions.map((row) => row.status)).toEqual(["pending", "failed"]);
    expect(storage.reads.map((read) => read.storageBucket)).toEqual([
      PRODUCT_DRAFT_IMAGE_BUCKET,
      PRODUCT_IMAGE_BUCKET,
    ]);
  });

  it("surfaces a lost run claim during reconciliation", async () => {
    const repository = new MemoryPromotionRepository([
      promotion({
        status: "promoted",
        source_content_length: 4,
        destination_size_bytes: 4,
        promoted_at: "2026-07-19T00:02:00Z",
      }),
    ]);
    repository.heartbeatAllowed = false;
    const service = new ClassifierImagePromotionService(
      repository,
      reader,
      new MemoryStorage(),
      config,
    );

    await expect(service.reconcilePromotedImages(run, run.attempt_token!)).rejects.toBeInstanceOf(
      ClassifierImportClaimLostError,
    );
  });
});
