import { describe, expect, it, vi } from "vitest";

import type { ProductPublicationConfig } from "./product-publication.config";
import type { ProductPublicationRepository } from "./product-publication.repository";
import type {
  ProductPublicationObject,
  ProductPublicationStorage,
} from "./product-publication.storage";
import type { ProductPublicationItem, ProductPublicationRun } from "./product-publication.types";
import { ProductPublicationWorker } from "./product-publication.worker";

const config: ProductPublicationConfig = {
  dispatchMode: "local",
  maximumImageCount: 20,
  itemConcurrency: 3,
  itemTimeoutMs: 1_000,
  workerDeadlineMs: 10_000,
  claimTimeoutSeconds: 360,
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "secret",
};

describe("ProductPublicationWorker", () => {
  it("copies and verifies every frozen image before finalization", async () => {
    const source = image([1, 2, 3]);
    const items = [item(1), item(2)];
    const repository = repositoryMock({ items });
    const publicObjects = new Set<string>();
    const storage = storageMock({
      read: async (bucket, objectKey) =>
        bucket === "product-draft-images" || publicObjects.has(objectKey) ? source : null,
      create: async (objectKey) => {
        publicObjects.add(objectKey);
        return "created";
      },
    });

    const result = await new ProductPublicationWorker(repository, storage, config).run(uuid(1));

    expect(result).toMatchObject({ status: "completed", productDraftId: uuid(1) });
    expect(storage.createPublicObject).toHaveBeenCalledTimes(2);
    expect(repository.recordObjectCreated).toHaveBeenCalledTimes(2);
    expect(repository.verifyItem).toHaveBeenCalledTimes(2);
    expect(repository.finalize).toHaveBeenCalledOnce();
  });

  it("never claims or reruns a failed publication after duplicate delivery", async () => {
    const repository = repositoryMock({
      claimed: null,
      currentRun: { ...run(), status: "failed", errorCode: "product_publication_transfer_failed" },
    });
    const storage = storageMock({});

    await expect(
      new ProductPublicationWorker(repository, storage, config).run(uuid(1)),
    ).resolves.toEqual({ status: "already_terminal", productDraftId: uuid(1) });
    expect(storage.read).not.toHaveBeenCalled();
    expect(repository.finalize).not.toHaveBeenCalled();
  });

  it("fails without overwriting a conflicting deterministic destination", async () => {
    const source = image([1, 2, 3]);
    const destination = image([9, 9, 9]);
    const repository = repositoryMock({
      items: [item(1)],
      currentRun: {
        ...run(),
        status: "failed",
        errorCode: "product_publication_destination_conflict",
      },
    });
    const storage = storageMock({
      read: async (bucket) => (bucket === "product-draft-images" ? source : destination),
    });

    const result = await new ProductPublicationWorker(repository, storage, config).run(uuid(1));

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "product_publication_destination_conflict",
    });
    expect(storage.createPublicObject).not.toHaveBeenCalled();
    expect(repository.failAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "product_publication_destination_conflict",
      }),
    );
  });

  it("deletes only a failed attempt's verified owned object", async () => {
    const source = image([1, 2, 3]);
    const digest = sha256(source.bytes);
    const first = item(1);
    const second = item(2);
    const cleanupItem = {
      ...first,
      status: "cleanup_required" as const,
      attemptToken: null,
      sourceSha256: digest,
      publicSha256: digest,
      publicSizeBytes: source.bytes.byteLength,
      publicUrl: publicUrl(first.destinationKey),
      objectCreatedByAttemptToken: uuid(9),
      errorCode: "product_publication_attempt_failed",
    };
    let itemReadCount = 0;
    const repository = repositoryMock({
      items: [first, second],
      listItems: async () => {
        itemReadCount += 1;
        return itemReadCount === 1 ? [first, second] : [cleanupItem];
      },
      currentRun: {
        ...run(),
        status: "failed",
        errorCode: "product_publication_source_unavailable",
      },
    });
    let firstPublicExists = false;
    const storage = storageMock({
      read: async (bucket, objectKey) => {
        if (bucket === "product-draft-images") {
          return objectKey === first.sourceObjectKey ? source : null;
        }
        return firstPublicExists ? source : null;
      },
      create: async () => {
        firstPublicExists = true;
        return "created";
      },
      delete: async () => {
        firstPublicExists = false;
      },
    });

    const result = await new ProductPublicationWorker(repository, storage, {
      ...config,
      itemConcurrency: 1,
    }).run(uuid(1));

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "product_publication_source_unavailable",
    });
    expect(storage.deletePublicObject).toHaveBeenCalledWith(
      first.destinationKey,
      expect.any(AbortSignal),
    );
    expect(repository.completeCleanup).toHaveBeenCalledWith({
      productDraftId: uuid(1),
      productDraftImageId: first.productDraftImageId,
      createdAttemptToken: uuid(9),
    });
  });

  it("never lets a stale attempt finalize a newer claim", async () => {
    const repository = repositoryMock({
      items: [item(1)],
      verifyItem: async () => false,
      failAttempt: async () => false,
    });
    const source = image([1, 2, 3]);
    const storage = storageMock({
      read: async () => source,
    });

    const result = await new ProductPublicationWorker(repository, storage, config).run(uuid(1));

    expect(result).toMatchObject({ status: "claim_lost" });
    expect(repository.finalize).not.toHaveBeenCalled();
  });

  it("durably closes an unexpected post-claim failure under the owning token", async () => {
    const repository = repositoryMock({
      listItems: async () => {
        throw new Error("unexpected database response");
      },
      currentRun: {
        ...run(),
        status: "failed",
        attemptToken: null,
        claimStartedAt: null,
        errorCode: "product_publication_finalization_failed",
      },
    });

    await expect(
      new ProductPublicationWorker(repository, storageMock({}), config).run(uuid(1)),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "product_publication_finalization_failed",
    });
    expect(repository.failClaimedRun).toHaveBeenCalledWith({
      productDraftId: uuid(1),
      attemptToken: uuid(9),
      errorCode: "product_publication_finalization_failed",
    });
  });
});

function repositoryMock(
  overrides: {
    items?: ProductPublicationItem[];
    claimed?: ProductPublicationRun | null;
    currentRun?: ProductPublicationRun;
    listItems?: () => Promise<ProductPublicationItem[]>;
    verifyItem?: () => Promise<boolean>;
    failAttempt?: () => Promise<boolean>;
  } = {},
): ProductPublicationRepository & Record<string, ReturnType<typeof vi.fn>> {
  const claimed = overrides.claimed === undefined ? run() : overrides.claimed;
  const currentRun = overrides.currentRun ?? {
    ...run(),
    status: "completed",
    attemptToken: null,
    completedAt: new Date().toISOString(),
  };
  return {
    authorize: vi.fn(),
    getRun: vi.fn(async () => currentRun),
    getFirstItemErrorCode: vi.fn(async () => null),
    claimRun: vi.fn(async () => claimed),
    listItems: vi.fn(overrides.listItems ?? (async () => overrides.items ?? [item(1)])),
    recordObjectCreated: vi.fn(async () => true),
    clearObjectOwnership: vi.fn(async () => true),
    verifyItem: vi.fn(overrides.verifyItem ?? (async () => true)),
    failAttempt: vi.fn(overrides.failAttempt ?? (async () => true)),
    failClaimedRun: vi.fn(async () => true),
    hasPublishedImage: vi.fn(async () => false),
    completeCleanup: vi.fn(async () => true),
    finalizeCleanup: vi.fn(async () => true),
    finalize: vi.fn(async () => "completed" as const),
    markDispatchFailed: vi.fn(async () => true),
    retry: vi.fn(),
  } as ProductPublicationRepository & Record<string, ReturnType<typeof vi.fn>>;
}

function storageMock(overrides: {
  read?: (
    bucket: "product-draft-images" | "product-images",
    objectKey: string,
  ) => Promise<ProductPublicationObject | null>;
  create?: (objectKey: string) => Promise<"created" | "already_exists">;
  delete?: () => Promise<void>;
}): ProductPublicationStorage & Record<string, ReturnType<typeof vi.fn>> {
  return {
    read: vi.fn(
      overrides.read ??
        (async () => {
          return null;
        }),
    ),
    createPublicObject: vi.fn(async (input: { objectKey: string }) =>
      overrides.create ? overrides.create(input.objectKey) : "already_exists",
    ),
    deletePublicObject: vi.fn(overrides.delete ?? (async () => undefined)),
    publicUrl: vi.fn(publicUrl),
  };
}

function run(): ProductPublicationRun {
  return {
    productDraftId: uuid(1),
    sellerId: uuid(2),
    status: "running",
    attemptCount: 1,
    attemptToken: uuid(9),
    claimStartedAt: new Date().toISOString(),
    errorCode: null,
    completedAt: null,
    delegatedActionRequestId: null,
    delegatedActionRequestFingerprint: null,
  };
}

function item(value: number): ProductPublicationItem {
  return {
    productDraftId: uuid(1),
    productDraftImageId: uuid(value + 10),
    sourceBucket: "product-draft-images",
    sourceObjectKey: `private/${value}.jpg`,
    destinationKey: `published-products/${uuid(1)}/${uuid(value + 10)}.jpg`,
    sourcePosition: value - 1,
    publicationOrder: value - 1,
    isCover: value === 1,
    expectedSourceSizeBytes: 3,
    expectedContentType: "image/jpeg",
    sourceSha256: null,
    status: "copying",
    attemptToken: uuid(9),
    publicSizeBytes: null,
    publicSha256: null,
    publicEtag: null,
    publicUrl: null,
    objectCreatedByAttemptToken: null,
    errorCode: null,
  };
}

function image(values: number[]): ProductPublicationObject {
  return {
    bytes: new Uint8Array(values),
    contentType: "image/jpeg",
    etag: '"etag"',
  };
}

function publicUrl(objectKey: string): string {
  return `https://example.supabase.co/storage/v1/object/public/product-images/${objectKey}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
import { createHash } from "node:crypto";
