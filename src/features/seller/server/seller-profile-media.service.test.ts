import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SellerProfileAssetRecord,
  SellerProfileMediaRepository,
} from "./seller-profile-media.repository";
import { SellerProfileMediaService } from "./seller-profile-media.service";
import {
  SellerProfileMediaStorageError,
  type SellerProfileMediaStorage,
} from "./seller-profile-media.storage";

const sellerId = "00000000-0000-4000-8000-000000000101";
const assetId = "00000000-0000-4000-8000-000000000201";

describe("seller profile media service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prepares a pending asset with a short-lived signed upload", async () => {
    const subject = createSubject(asset());

    const result = await subject.service.prepare(sellerId, {
      kind: "logo",
      originalFilename: "logo.png",
      contentType: "image/png",
      sizeBytes: 100,
      requestId: "00000000-0000-4000-8000-000000000301",
    });

    expect(result.uploadPath).toBe(`${sellerId}/${assetId}.png`);
    expect(result.uploadToken).toBe("upload-token");
    expect(result.uploadExpiresAt).toBe("2026-08-11T12:05:00.000Z");
  });

  it("does not sign another upload for an available replay", async () => {
    const subject = createSubject(asset({ status: "available" }));

    const result = await subject.service.prepare(sellerId, {
      kind: "logo",
      originalFilename: "logo.png",
      contentType: "image/png",
      sizeBytes: 100,
      requestId: "00000000-0000-4000-8000-000000000301",
    });

    expect(result.uploadPath).toBeNull();
    expect(subject.storage.createSignedUpload).not.toHaveBeenCalled();
  });

  it("fully decodes and finalizes a valid image", async () => {
    const bytes = new Uint8Array(
      await sharp({
        create: { width: 2, height: 2, channels: 4, background: "#336699" },
      })
        .png()
        .toBuffer(),
    );
    const record = asset({ sizeBytes: bytes.byteLength });
    const subject = createSubject(record);
    subject.repository.findOwned.mockResolvedValue(record);
    subject.repository.completeUpload.mockResolvedValue(
      asset({
        sizeBytes: bytes.byteLength,
        status: "available",
      }),
    );
    subject.storage.read.mockResolvedValue({
      contentType: "image/png",
      sizeBytes: bytes.byteLength,
      bytes,
    });

    await expect(subject.service.finalize(sellerId, assetId)).resolves.toMatchObject({
      assetId,
      status: "available",
    });
    expect(subject.repository.completeUpload).toHaveBeenCalledWith(
      sellerId,
      assetId,
      "image/png",
      bytes.byteLength,
    );
  });

  it("durably fails malformed image bytes and removes the invalid object", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const record = asset({ sizeBytes: bytes.byteLength });
    const subject = createSubject(record);
    subject.repository.findOwned.mockResolvedValue(record);
    subject.storage.read.mockResolvedValue({
      contentType: "image/png",
      sizeBytes: bytes.byteLength,
      bytes,
    });

    await expect(subject.service.finalize(sellerId, assetId)).rejects.toMatchObject({
      code: "seller_profile_image_invalid",
    });
    expect(subject.repository.failValidation).toHaveBeenCalledWith(sellerId, assetId);
    expect(subject.storage.delete).toHaveBeenCalledWith(
      `${sellerId}/${assetId}.png`,
      expect.any(AbortSignal),
    );
  });

  it("leaves pending state unchanged for a transient storage read failure", async () => {
    const record = asset();
    const subject = createSubject(record);
    subject.repository.findOwned.mockResolvedValue(record);
    subject.storage.read.mockRejectedValue(new SellerProfileMediaStorageError());

    await expect(subject.service.finalize(sellerId, assetId)).rejects.toMatchObject({
      code: "seller_profile_image_storage_unavailable",
    });
    expect(subject.repository.failValidation).not.toHaveBeenCalled();
  });

  it("persists cleanup-required state when object deletion fails", async () => {
    const subject = createSubject(asset({ status: "available" }));
    subject.repository.beginRemoval.mockResolvedValue({
      result: "deleting",
      objectKey: `${sellerId}/${assetId}.png`,
    });
    subject.storage.delete.mockRejectedValue(new SellerProfileMediaStorageError());

    await expect(subject.service.remove(sellerId, assetId)).rejects.toMatchObject({
      code: "seller_profile_image_cleanup_required",
    });
    expect(subject.repository.failRemoval).toHaveBeenCalledWith(sellerId, assetId);
  });

  it("uses the same not-found result for unknown and unauthorized private assets", async () => {
    const subject = createSubject(null);
    subject.repository.findById.mockResolvedValue(
      asset({ sellerId: "00000000-0000-4000-8000-000000000999" }),
    );

    await expect(
      subject.service.getPrivate(assetId, {
        sellerId,
        prototypeAdministrator: false,
      }),
    ).rejects.toMatchObject({ code: "seller_profile_image_not_found" });

    subject.repository.findById.mockResolvedValue(null);
    await expect(
      subject.service.getPrivate(assetId, {
        sellerId,
        prototypeAdministrator: false,
      }),
    ).rejects.toMatchObject({ code: "seller_profile_image_not_found" });
  });
});

function createSubject(prepared: SellerProfileAssetRecord | null) {
  const repository = {
    prepare: vi.fn(async () => prepared ?? asset()),
    findOwned: vi.fn(async () => prepared),
    findById: vi.fn(async () => prepared),
    findPublic: vi.fn(async () => prepared),
    completeUpload: vi.fn(async () => asset({ status: "available" })),
    failValidation: vi.fn(async () =>
      asset({ status: "failed", errorCode: "seller_profile_image_invalid" }),
    ),
    beginRemoval: vi.fn(async () => ({
      result: "deleting" as const,
      objectKey: `${sellerId}/${assetId}.png`,
    })),
    completeRemoval: vi.fn(async () => asset({ status: "deleted" })),
    failRemoval: vi.fn(async () =>
      asset({ status: "failed", errorCode: "seller_profile_image_cleanup_required" }),
    ),
    claimCleanupRetry: vi.fn(async () => ({
      result: "deleting" as const,
      objectKey: `${sellerId}/${assetId}.png`,
    })),
  } satisfies SellerProfileMediaRepository;
  const storage = {
    createSignedUpload: vi.fn(async (path: string) => ({ path, token: "upload-token" })),
    read: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
  } satisfies SellerProfileMediaStorage;
  return {
    repository,
    storage,
    service: new SellerProfileMediaService(repository, storage, () =>
      Date.parse("2026-08-11T12:00:00.000Z"),
    ),
  };
}

function asset(overrides: Partial<SellerProfileAssetRecord> = {}): SellerProfileAssetRecord {
  return {
    assetId,
    sellerId,
    kind: "logo",
    objectKey: `${sellerId}/${assetId}.png`,
    originalFilename: "logo.png",
    contentType: "image/png",
    sizeBytes: 100,
    status: "pending",
    prepareRequestId: "00000000-0000-4000-8000-000000000301",
    errorCode: null,
    ...overrides,
  };
}
