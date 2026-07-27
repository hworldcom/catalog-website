import { describe, expect, it, vi } from "vitest";

import type { DestinationObjectInfo } from "./destination-image-storage";
import type {
  ProductDraftImageDeliveryData,
  ProductDraftImageDeliveryRecord,
  ProductDraftImageDeliveryRepository,
} from "./product-draft-image-delivery.repository";
import {
  ProductDraftImageDeliveryEngine,
  ProductDraftImageDeliveryService,
} from "./product-draft-image-delivery.service";
import {
  ProductDraftImageDeliveryStorageError,
  type ProductDraftImageDeliveryStorage,
} from "./product-draft-image-delivery.storage";
import {
  parseProductDraftImageDeliveryInput,
  PRODUCT_DRAFT_IMAGE_DELIVERY_MAX_PAIRS,
  type ConfirmedPrototypeAdministratorContext,
} from "./product-draft-image-delivery.types";

const administrator: ConfirmedPrototypeAdministratorContext = {
  userId: uuid(900),
  prototypeAdministrator: true,
};

class MemoryRepository implements ProductDraftImageDeliveryRepository {
  readonly load = vi.fn(
    async (
      productDraftIds: string[],
      _imageIds: string[],
      _signal: AbortSignal,
    ): Promise<ProductDraftImageDeliveryData> => ({
      existingProductDraftIds: new Set(productDraftIds),
      images: this.images,
    }),
  );

  constructor(readonly images: ProductDraftImageDeliveryRecord[]) {}
}

class MemoryStorage implements ProductDraftImageDeliveryStorage {
  readonly getInfo = vi.fn<ProductDraftImageDeliveryStorage["getInfo"]>(
    async (_destinationKey: string, _signal: AbortSignal) => ({
      contentType: "image/jpeg",
      sizeBytes: 10,
      metadata: {},
    }),
  );
  readonly createSignedUrl = vi.fn<ProductDraftImageDeliveryStorage["createSignedUrl"]>(
    async (destinationKey: string, _expiresInSeconds: number, _signal: AbortSignal) =>
      `https://project.supabase.co/storage/v1/object/sign/${destinationKey}?token=signed`,
  );
}

describe("ProductDraftImageDeliveryEngine", () => {
  it("returns grouped results in request order and deduplicates repeated image identifiers", async () => {
    const firstDraftId = uuid(1);
    const secondDraftId = uuid(2);
    const firstImageId = uuid(101);
    const secondImageId = uuid(102);
    const repository = new MemoryRepository([
      availableRecord(firstDraftId, firstImageId),
      availableRecord(secondDraftId, secondImageId),
    ]);
    const storage = new MemoryStorage();
    const service = new ProductDraftImageDeliveryEngine(repository, storage, {
      now: () => Date.parse("2026-07-24T12:00:00.000Z"),
    });

    const response = await service.resolve([
      { productDraftId: secondDraftId, imageIds: [secondImageId, secondImageId] },
      { productDraftId: firstDraftId, imageIds: [firstImageId] },
    ]);

    expect(response.entries.map((entry) => entry.productDraftId)).toEqual([
      secondDraftId,
      firstDraftId,
    ]);
    expect(response.entries[0]?.images).toHaveLength(1);
    expect(response.entries[0]?.images[0]).toMatchObject({
      imageId: secondImageId,
      deliveryStatus: "available",
      deliveryErrorCode: null,
      expiresAt: "2026-07-24T12:05:00.000Z",
    });
    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(repository.load.mock.calls[0]?.[0]).toEqual([secondDraftId, firstDraftId]);
    expect(repository.load.mock.calls[0]?.[1]).toEqual([secondImageId, firstImageId]);
    expect(storage.getInfo).toHaveBeenCalledTimes(2);
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("maps non-deliverable durable states without storage work", async () => {
    const productDraftId = uuid(1);
    const pendingImageId = uuid(101);
    const failedImageId = uuid(102);
    const reconciledFailureImageId = uuid(103);
    const publicBucketImageId = uuid(104);
    const missingImageId = uuid(105);
    const repository = new MemoryRepository([
      record(productDraftId, pendingImageId, { status: "pending" }),
      record(productDraftId, failedImageId, { status: "failed" }),
      record(productDraftId, reconciledFailureImageId, {
        reconciliationStatus: "failed",
        reconciliationErrorCode: "legacy_source_missing",
      }),
      record(productDraftId, publicBucketImageId, { storageBucket: "product-images" }),
    ]);
    const storage = new MemoryStorage();
    const logger = { error: vi.fn() };
    const service = new ProductDraftImageDeliveryEngine(repository, storage, { logger });

    const response = await service.resolve([
      {
        productDraftId,
        imageIds: [
          pendingImageId,
          failedImageId,
          reconciledFailureImageId,
          publicBucketImageId,
          missingImageId,
        ],
      },
    ]);

    expect(response.entries[0]?.images).toEqual([
      state(pendingImageId, "pending", "pending"),
      state(failedImageId, "failed", "failed"),
      unavailable(reconciledFailureImageId, "legacy_source_missing"),
      unavailable(publicBucketImageId, "private_object_conflict"),
      state(missingImageId, null, "missing"),
    ]);
    expect(storage.getInfo).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("masks an image owned by another ProductDraft as missing", async () => {
    const requestedDraftId = uuid(1);
    const otherDraftId = uuid(2);
    const imageId = uuid(101);
    const repository = new MemoryRepository([availableRecord(otherDraftId, imageId)]);
    const storage = new MemoryStorage();
    const service = new ProductDraftImageDeliveryEngine(repository, storage);

    const response = await service.resolve([
      { productDraftId: requestedDraftId, imageIds: [imageId] },
    ]);

    expect(response.entries[0]?.images).toEqual([state(imageId, null, "missing")]);
    expect(storage.getInfo).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it("keeps object-specific failures isolated from healthy siblings", async () => {
    const productDraftId = uuid(1);
    const missingImageId = uuid(101);
    const conflictImageId = uuid(102);
    const rejectedImageId = uuid(103);
    const healthyImageId = uuid(104);
    const records = [
      availableRecord(productDraftId, missingImageId),
      availableRecord(productDraftId, conflictImageId),
      availableRecord(productDraftId, rejectedImageId),
      availableRecord(productDraftId, healthyImageId),
    ];
    const repository = new MemoryRepository(records);
    const storage = new MemoryStorage();
    storage.getInfo.mockImplementation(async (destinationKey) => {
      if (destinationKey.includes(missingImageId)) return null;
      return {
        contentType: "image/jpeg",
        sizeBytes: destinationKey.includes(conflictImageId) ? 11 : 10,
        metadata: {},
      };
    });
    storage.createSignedUrl.mockImplementation(async (destinationKey) => {
      if (destinationKey.includes(rejectedImageId)) {
        throw new ProductDraftImageDeliveryStorageError(
          "signing_rejected",
          "object signing rejected",
        );
      }
      return `https://signed.test/${destinationKey}?token=opaque`;
    });
    const logger = { error: vi.fn() };
    const service = new ProductDraftImageDeliveryEngine(repository, storage, { logger });

    const response = await service.resolve([
      { productDraftId, imageIds: records.map((item) => item.imageId) },
    ]);

    expect(response.entries[0]?.images).toEqual([
      unavailable(missingImageId, "private_object_missing"),
      unavailable(conflictImageId, "private_object_conflict"),
      unavailable(rejectedImageId, "private_object_signing_failed"),
      expect.objectContaining({
        imageId: healthyImageId,
        deliveryStatus: "available",
      }),
    ]);
    expect(logger.error).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("token=opaque");
  });

  it("fails the complete invocation for storage infrastructure failure", async () => {
    const productDraftId = uuid(1);
    const firstImageId = uuid(101);
    const secondImageId = uuid(102);
    const repository = new MemoryRepository([
      availableRecord(productDraftId, firstImageId),
      availableRecord(productDraftId, secondImageId),
    ]);
    const storage = new MemoryStorage();
    storage.createSignedUrl.mockImplementation(async (destinationKey) => {
      if (destinationKey.includes(secondImageId)) {
        throw new ProductDraftImageDeliveryStorageError(
          "service_unavailable",
          "storage unavailable",
        );
      }
      return `https://signed.test/${destinationKey}`;
    });
    const service = new ProductDraftImageDeliveryEngine(repository, storage);

    await expect(
      service.resolve([{ productDraftId, imageIds: [firstImageId, secondImageId] }]),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "product_draft_image_delivery_unavailable",
    });
  });

  it("never runs more than ten storage operations concurrently for 100 pairs", async () => {
    const productDraftId = uuid(1);
    const records = Array.from({ length: PRODUCT_DRAFT_IMAGE_DELIVERY_MAX_PAIRS }, (_, index) =>
      availableRecord(productDraftId, uuid(index + 100)),
    );
    const repository = new MemoryRepository(records);
    let active = 0;
    let maximumActive = 0;
    const operation = async <T>(result: T): Promise<T> => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return result;
    };
    const storage: ProductDraftImageDeliveryStorage = {
      getInfo: vi.fn(async () =>
        operation({ contentType: "image/jpeg", sizeBytes: 10, metadata: {} }),
      ),
      createSignedUrl: vi.fn(async (destinationKey) =>
        operation(`https://signed.test/${destinationKey}`),
      ),
    };
    const service = new ProductDraftImageDeliveryEngine(repository, storage);

    const response = await service.resolve([
      { productDraftId, imageIds: records.map((item) => item.imageId) },
    ]);

    expect(response.entries[0]?.images).toHaveLength(100);
    expect(maximumActive).toBeLessThanOrEqual(10);
  });

  it("turns an operation timeout into a total delivery failure and aborts storage", async () => {
    const productDraftId = uuid(1);
    const imageId = uuid(101);
    const repository = new MemoryRepository([availableRecord(productDraftId, imageId)]);
    let storageAborted = false;
    const storage: ProductDraftImageDeliveryStorage = {
      getInfo: vi.fn<ProductDraftImageDeliveryStorage["getInfo"]>(
        async (_destinationKey, signal) =>
          new Promise<DestinationObjectInfo | null>((_, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                storageAborted = true;
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          }),
      ),
      createSignedUrl: vi.fn(),
    };
    const service = new ProductDraftImageDeliveryEngine(repository, storage, {
      operationTimeoutMs: 5,
      requestTimeoutMs: 100,
    });

    await expect(service.resolve([{ productDraftId, imageIds: [imageId] }])).rejects.toMatchObject({
      statusCode: 500,
      code: "product_draft_image_delivery_unavailable",
    });
    expect(storageAborted).toBe(true);
  });

  it("enforces the overall deadline during database reads", async () => {
    const productDraftId = uuid(1);
    const imageId = uuid(101);
    let repositoryAborted = false;
    const repository: ProductDraftImageDeliveryRepository = {
      load: vi.fn<ProductDraftImageDeliveryRepository["load"]>(
        async (_productDraftIds, _imageIds, signal) =>
          new Promise<ProductDraftImageDeliveryData>((_, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                repositoryAborted = true;
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          }),
      ),
    };
    const service = new ProductDraftImageDeliveryEngine(repository, new MemoryStorage(), {
      requestTimeoutMs: 5,
    });

    await expect(service.resolve([{ productDraftId, imageIds: [imageId] }])).rejects.toMatchObject({
      statusCode: 500,
      code: "product_draft_image_delivery_unavailable",
    });
    expect(repositoryAborted).toBe(true);
  });

  it("returns not found when any requested ProductDraft does not exist", async () => {
    const productDraftId = uuid(1);
    const repository = new MemoryRepository([]);
    repository.load.mockResolvedValue({
      existingProductDraftIds: new Set(),
      images: [],
    });
    const storage = new MemoryStorage();
    const service = new ProductDraftImageDeliveryEngine(repository, storage);

    await expect(
      service.resolve([{ productDraftId, imageIds: [uuid(101)] }]),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "product_draft_not_found",
    });
    expect(storage.getInfo).not.toHaveBeenCalled();
  });

  it("rejects an unconfirmed administrator before database or storage access", async () => {
    const repository = new MemoryRepository([]);
    const storage = new MemoryStorage();
    const engine = new ProductDraftImageDeliveryEngine(repository, storage);
    const service = new ProductDraftImageDeliveryService(engine);

    await expect(
      service.resolve([{ productDraftId: uuid(1), imageIds: [uuid(101)] }], {
        userId: uuid(900),
        prototypeAdministrator: false,
      } as unknown as ConfirmedPrototypeAdministratorContext),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "prototype_administrator_required",
    });
    expect(repository.load).not.toHaveBeenCalled();
  });
});

describe("parseProductDraftImageDeliveryInput", () => {
  it("rejects empty entries, malformed identifiers, duplicate drafts, and more than 100 pairs", () => {
    const draftId = uuid(1);
    const invalidInputs = [
      [],
      [{ productDraftId: draftId, imageIds: [] }],
      [{ productDraftId: "not-a-uuid", imageIds: [uuid(101)] }],
      [
        { productDraftId: draftId, imageIds: [uuid(101)] },
        { productDraftId: draftId, imageIds: [uuid(102)] },
      ],
      [
        {
          productDraftId: draftId,
          imageIds: Array.from({ length: PRODUCT_DRAFT_IMAGE_DELIVERY_MAX_PAIRS + 1 }, (_, index) =>
            uuid(index + 100),
          ),
        },
      ],
    ];

    for (const input of invalidInputs) {
      expect(() => parseProductDraftImageDeliveryInput(input)).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: "product_draft_image_delivery_invalid",
        }),
      );
    }
  });

  it("counts unique pairs after repeated image identifiers are deduplicated", () => {
    const imageIds = Array.from({ length: PRODUCT_DRAFT_IMAGE_DELIVERY_MAX_PAIRS }, (_, index) =>
      uuid(index + 100),
    );
    expect(
      parseProductDraftImageDeliveryInput([
        {
          productDraftId: uuid(1),
          imageIds: [...imageIds, ...imageIds],
        },
      ])[0]?.imageIds,
    ).toEqual(imageIds);
  });
});

function availableRecord(productDraftId: string, imageId: string): ProductDraftImageDeliveryRecord {
  return record(productDraftId, imageId);
}

function record(
  productDraftId: string,
  imageId: string,
  overrides: Partial<ProductDraftImageDeliveryRecord> = {},
): ProductDraftImageDeliveryRecord {
  return {
    productDraftId,
    imageId,
    status: "available",
    storageBucket: "product-draft-images",
    destinationKey: `product-drafts/${productDraftId}/images/${imageId}.jpg`,
    contentType: "image/jpeg",
    sizeBytes: 10,
    reconciliationStatus: null,
    reconciliationErrorCode: null,
    ...overrides,
  };
}

function state(
  imageId: string,
  durableStatus: "pending" | "failed" | null,
  deliveryStatus: "pending" | "failed" | "missing",
) {
  return {
    imageId,
    durableStatus,
    deliveryStatus,
    deliveryErrorCode: null,
    url: null,
    expiresAt: null,
  };
}

function unavailable(imageId: string, deliveryErrorCode: string) {
  return {
    imageId,
    durableStatus: "available",
    deliveryStatus: "unavailable",
    deliveryErrorCode,
    url: null,
    expiresAt: null,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
