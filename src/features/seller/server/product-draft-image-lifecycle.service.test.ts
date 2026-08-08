import { describe, expect, it, vi } from "vitest";

import type {
  ProductDraftImageLifecycleRecord,
  ProductDraftImageLifecycleRepository,
} from "./product-draft-image-lifecycle.repository";
import { ProductDraftImageLifecycleService } from "./product-draft-image-lifecycle.service";
import {
  hasMatchingImageSignature,
  ProductDraftImageLifecycleStorageError,
  type ProductDraftImageLifecycleStorage,
} from "./product-draft-image-lifecycle.storage";

const sellerId = uuid(1);
const productDraftId = uuid(2);
const firstImageId = uuid(101);
const secondImageId = uuid(102);

describe("ProductDraftImageLifecycleService", () => {
  it("prepares exact signed uploads while keeping completed replays non-overwriting", async () => {
    const repository = repositoryMock();
    repository.prepare.mockResolvedValue({
      result: "prepared",
      galleryRevision: 7,
      images: [
        image({ imageId: firstImageId, durableStatus: "pending" }),
        image({ imageId: secondImageId, durableStatus: "available", clientUploadId: uuid(202) }),
      ],
    });
    const storage = storageMock();
    storage.createSignedUpload.mockResolvedValue({ path: "private/first.jpg", token: "token-1" });
    const service = new ProductDraftImageLifecycleService(repository, storage, () =>
      Date.parse("2026-08-08T10:00:00.000Z"),
    );

    await expect(
      service.prepare(sellerId, {
        productDraftId,
        expectedGalleryRevision: 6,
        files: [
          {
            clientUploadId: uuid(201),
            originalFilename: "front.jpg",
            contentType: "image/jpeg",
            sizeBytes: 100,
          },
          {
            clientUploadId: uuid(202),
            originalFilename: "front.jpg",
            contentType: "image/jpeg",
            sizeBytes: 100,
          },
        ],
      }),
    ).resolves.toEqual({
      productDraftId,
      galleryRevision: 7,
      images: [
        expect.objectContaining({
          imageId: firstImageId,
          durableStatus: "pending",
          uploadPath: "private/first.jpg",
          uploadToken: "token-1",
          uploadExpiresAt: "2026-08-08T12:00:00.000Z",
        }),
        expect.objectContaining({
          imageId: secondImageId,
          durableStatus: "available",
          uploadPath: null,
          uploadToken: null,
          uploadExpiresAt: null,
        }),
      ],
    });
    expect(storage.createSignedUpload).toHaveBeenCalledOnce();
  });

  it("persists retry cleanup failure before returning it", async () => {
    const repository = repositoryMock();
    repository.listByClientUploadIds.mockResolvedValue([
      image({
        durableStatus: "failed",
        lifecycleErrorCode: "product_draft_image_verification_failed",
      }),
    ]);
    const storage = storageMock();
    storage.inspect.mockRejectedValue(new ProductDraftImageLifecycleStorageError("unavailable"));
    const service = new ProductDraftImageLifecycleService(repository, storage);

    await expect(
      service.prepare(sellerId, {
        productDraftId,
        expectedGalleryRevision: 3,
        files: [
          {
            clientUploadId: uuid(201),
            originalFilename: "front.jpg",
            contentType: "image/jpeg",
            sizeBytes: 100,
          },
        ],
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "product_draft_image_upload_cleanup_failed",
    });
    expect(repository.failUploadCleanup).toHaveBeenCalledWith({
      productDraftId,
      sellerId,
      imageId: firstImageId,
    });
    expect(repository.prepare).not.toHaveBeenCalled();
  });

  it("verifies JPEG, PNG, and WebP signatures and cleans invalid sibling bytes", async () => {
    const repository = repositoryMock();
    repository.listByImageIds.mockResolvedValue([
      image({ imageId: uuid(111), contentType: "image/jpeg", destinationKey: "a.jpg" }),
      image({ imageId: uuid(112), contentType: "image/png", destinationKey: "b.png" }),
      image({ imageId: uuid(113), contentType: "image/webp", destinationKey: "c.webp" }),
      image({ imageId: uuid(114), contentType: "image/jpeg", destinationKey: "bad.jpg" }),
    ]);
    repository.finalize.mockResolvedValue({
      result: "finalized",
      productDraftId,
      galleryRevision: 9,
    });
    const storage = storageMock();
    storage.inspect.mockImplementation(async (path) => {
      if (path === "a.jpg") return stored("image/jpeg", [0xff, 0xd8, 0xff]);
      if (path === "b.png") {
        return stored("image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      }
      if (path === "c.webp") {
        return stored("image/webp", [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]);
      }
      if (storage.delete.mock.calls.some(([deletedPath]) => deletedPath === path)) return null;
      return stored("image/jpeg", [0, 1, 2]);
    });

    const result = await new ProductDraftImageLifecycleService(repository, storage).finalize(
      sellerId,
      {
        productDraftId,
        imageIds: [uuid(111), uuid(112), uuid(113), uuid(114)],
      },
    );

    expect(result).toEqual({
      productDraftId,
      galleryRevision: 9,
      images: [
        { imageId: uuid(111), durableStatus: "available", lifecycleErrorCode: null },
        { imageId: uuid(112), durableStatus: "available", lifecycleErrorCode: null },
        { imageId: uuid(113), durableStatus: "available", lifecycleErrorCode: null },
        {
          imageId: uuid(114),
          durableStatus: "failed",
          lifecycleErrorCode: "product_draft_image_verification_failed",
        },
      ],
    });
    expect(storage.delete).toHaveBeenCalledWith("bad.jpg", expect.any(AbortSignal));
    expect(repository.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.arrayContaining([
          expect.objectContaining({ imageId: uuid(113), contentType: "image/webp" }),
          expect.objectContaining({
            imageId: uuid(114),
            errorCode: "product_draft_image_verification_failed",
          }),
        ]),
      }),
    );
  });

  it("keeps removal durable when private-object deletion fails", async () => {
    const repository = repositoryMock();
    repository.beginRemoval.mockResolvedValue({
      result: "cleanup_required",
      productDraftId,
      galleryRevision: 5,
      destinationKey: "draft/removing.webp",
    });
    const storage = storageMock();
    storage.inspect.mockResolvedValue(stored("image/webp", ascii("RIFF0000WEBP")));
    storage.delete.mockRejectedValue(new ProductDraftImageLifecycleStorageError("unavailable"));

    await expect(
      new ProductDraftImageLifecycleService(repository, storage).remove(sellerId, {
        productDraftId,
        imageId: firstImageId,
        expectedGalleryRevision: 4,
      }),
    ).rejects.toMatchObject({ code: "product_draft_image_storage_unavailable" });
    expect(repository.failRemoval).toHaveBeenCalledWith({
      productDraftId,
      sellerId,
      imageId: firstImageId,
    });
    expect(repository.completeRemoval).not.toHaveBeenCalled();
  });

  it("retries only cleanup-required upload failures and verifies object absence", async () => {
    const repository = repositoryMock();
    repository.listByImageIds.mockResolvedValue([
      image({
        durableStatus: "failed",
        lifecycleErrorCode: "product_draft_image_upload_cleanup_failed",
      }),
    ]);
    repository.completeUploadCleanup.mockResolvedValue({
      result: "cleanup_completed",
      productDraftId,
      galleryRevision: 8,
    });
    const storage = storageMock();
    storage.inspect
      .mockResolvedValueOnce(stored("image/jpeg", [0xff, 0xd8, 0xff]))
      .mockResolvedValueOnce(null);

    await expect(
      new ProductDraftImageLifecycleService(repository, storage).retryCleanup(sellerId, {
        productDraftId,
        imageId: firstImageId,
      }),
    ).resolves.toEqual({ productDraftId, galleryRevision: 8 });
    expect(storage.delete).toHaveBeenCalledWith("private/first.jpg", expect.any(AbortSignal));
    expect(repository.completeUploadCleanup).toHaveBeenCalledWith({
      productDraftId,
      sellerId,
      imageId: firstImageId,
    });
  });

  it("rejects cleanup retry for a normal failed upload", async () => {
    const repository = repositoryMock();
    repository.listByImageIds.mockResolvedValue([
      image({
        durableStatus: "failed",
        lifecycleErrorCode: "product_draft_image_verification_failed",
      }),
    ]);
    const storage = storageMock();

    await expect(
      new ProductDraftImageLifecycleService(repository, storage).retryCleanup(sellerId, {
        productDraftId,
        imageId: firstImageId,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "product_draft_image_upload_invalid",
    });
    expect(storage.inspect).not.toHaveBeenCalled();
    expect(repository.completeUploadCleanup).not.toHaveBeenCalled();
  });

  it("recognizes only exact supported file signatures", () => {
    expect(hasMatchingImageSignature("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]))).toBe(true);
    expect(
      hasMatchingImageSignature(
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true);
    expect(hasMatchingImageSignature("image/webp", new Uint8Array(ascii("RIFF0000WEBP")))).toBe(
      true,
    );
    expect(hasMatchingImageSignature("image/jpeg", new Uint8Array(ascii("not-jpeg")))).toBe(false);
  });
});

function repositoryMock() {
  return {
    listByClientUploadIds: vi.fn<ProductDraftImageLifecycleRepository["listByClientUploadIds"]>(
      async () => [],
    ),
    listByImageIds: vi.fn<ProductDraftImageLifecycleRepository["listByImageIds"]>(async () => []),
    prepare: vi.fn<ProductDraftImageLifecycleRepository["prepare"]>(async () => ({
      result: "prepared",
      galleryRevision: 1,
      images: [],
    })),
    finalize: vi.fn<ProductDraftImageLifecycleRepository["finalize"]>(async () => ({
      result: "finalized",
      productDraftId,
      galleryRevision: 1,
    })),
    failUploadCleanup: vi.fn<ProductDraftImageLifecycleRepository["failUploadCleanup"]>(
      async () => ({ result: "cleanup_failed", productDraftId, galleryRevision: 1 }),
    ),
    completeUploadCleanup: vi.fn<ProductDraftImageLifecycleRepository["completeUploadCleanup"]>(
      async () => ({ result: "cleanup_completed", productDraftId, galleryRevision: 1 }),
    ),
    update: vi.fn<ProductDraftImageLifecycleRepository["update"]>(async () => ({
      result: "updated",
      productDraftId,
      galleryRevision: 1,
    })),
    beginRemoval: vi.fn<ProductDraftImageLifecycleRepository["beginRemoval"]>(async () => ({
      result: "cleanup_required",
      productDraftId,
      galleryRevision: 1,
      destinationKey: "draft/image.jpg",
    })),
    completeRemoval: vi.fn<ProductDraftImageLifecycleRepository["completeRemoval"]>(async () => ({
      result: "removed",
      productDraftId,
      galleryRevision: 1,
    })),
    failRemoval: vi.fn<ProductDraftImageLifecycleRepository["failRemoval"]>(async () => ({
      result: "cleanup_failed",
      productDraftId,
      galleryRevision: 1,
    })),
  };
}

function storageMock() {
  return {
    createSignedUpload: vi.fn<ProductDraftImageLifecycleStorage["createSignedUpload"]>(
      async () => ({
        path: "private/image.jpg",
        token: "token",
      }),
    ),
    inspect: vi.fn<ProductDraftImageLifecycleStorage["inspect"]>(async () => null),
    delete: vi.fn<ProductDraftImageLifecycleStorage["delete"]>(async () => undefined),
  };
}

function image(
  overrides: Partial<ProductDraftImageLifecycleRecord> = {},
): ProductDraftImageLifecycleRecord {
  return {
    imageId: firstImageId,
    productDraftId,
    clientUploadId: uuid(201),
    originalFilename: "front.jpg",
    contentType: "image/jpeg",
    sizeBytes: 100,
    destinationKey: "private/first.jpg",
    durableStatus: "pending",
    lifecycleErrorCode: null,
    ...overrides,
  };
}

function stored(contentType: string, bytes: number[] | Uint8Array) {
  return {
    contentType,
    sizeBytes: 100,
    signatureBytes: new Uint8Array(bytes),
  };
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
