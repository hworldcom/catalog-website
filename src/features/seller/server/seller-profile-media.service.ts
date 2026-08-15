import {
  SELLER_PROFILE_IMAGE_MAX_SIZE_BYTES,
  SELLER_PROFILE_IMAGE_SIGNED_UPLOAD_LIFETIME_SECONDS,
  SellerProfileImageError,
  type PrepareSellerProfileAssetUploadInput,
  type PrepareSellerProfileAssetUploadResponse,
  type SellerProfileAsset,
  type SellerProfileAssetKind,
} from "../seller-profile-media.types";
import { decodeSellerProfileImage } from "./seller-profile-image-decoder";
import type {
  SellerProfileAssetRecord,
  SellerProfileMediaRepository,
} from "./seller-profile-media.repository";
import {
  type SellerProfileMediaStorage,
  type SellerProfileStoredImage,
} from "./seller-profile-media.storage";

const STORAGE_OPERATION_TIMEOUT_MS = 10_000;

export class SellerProfileMediaService {
  constructor(
    private readonly repository: SellerProfileMediaRepository,
    private readonly storage: SellerProfileMediaStorage,
    private readonly now: () => number = Date.now,
  ) {}

  async prepare(
    sellerId: string,
    input: PrepareSellerProfileAssetUploadInput,
  ): Promise<PrepareSellerProfileAssetUploadResponse> {
    const asset = await this.database(() => this.repository.prepare(sellerId, input));
    if (asset.status !== "pending") {
      return {
        asset: publicAsset(asset),
        uploadPath: null,
        uploadToken: null,
        uploadExpiresAt: null,
      };
    }

    let upload;
    try {
      upload = await this.storage.createSignedUpload(asset.objectKey);
    } catch (error) {
      throw mapStorageError(error);
    }
    return {
      asset: publicAsset(asset),
      uploadPath: upload.path,
      uploadToken: upload.token,
      uploadExpiresAt: new Date(
        this.now() + SELLER_PROFILE_IMAGE_SIGNED_UPLOAD_LIFETIME_SECONDS * 1000,
      ).toISOString(),
    };
  }

  async finalize(sellerId: string, assetId: string): Promise<SellerProfileAsset> {
    const asset = await this.requireOwned(sellerId, assetId);
    if (asset.status === "available") return publicAsset(asset);
    if (asset.status === "failed" && asset.errorCode === "seller_profile_image_invalid") {
      throw invalidImage();
    }
    if (asset.status !== "pending") throw notReady();

    const stored = await this.readStoredImage(asset.objectKey);
    if (!stored) throw notReady();
    const valid = await isValidStoredImage(asset, stored);
    if (!valid) {
      await this.database(() => this.repository.failValidation(sellerId, assetId));
      try {
        await this.deleteStoredImage(asset.objectKey);
      } catch (error) {
        console.error("[Seller profile image] Invalid object cleanup failed.", {
          exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
        });
      }
      throw invalidImage();
    }

    return publicAsset(
      await this.database(() =>
        this.repository.completeUpload(
          sellerId,
          assetId,
          asset.contentType,
          stored.bytes.byteLength,
        ),
      ),
    );
  }

  async remove(sellerId: string, assetId: string): Promise<SellerProfileAsset> {
    const claim = await this.database(() => this.repository.beginRemoval(sellerId, assetId));
    if (claim.result === "deleted") return publicAsset(await this.requireOwned(sellerId, assetId));

    try {
      await this.deleteStoredImage(claim.objectKey);
      return publicAsset(
        await this.database(() => this.repository.completeRemoval(sellerId, assetId)),
      );
    } catch (error) {
      await this.database(() => this.repository.failRemoval(sellerId, assetId));
      throw cleanupRequired();
    }
  }

  async retryCleanup(sellerId: string, assetId: string): Promise<SellerProfileAsset> {
    const claim = await this.database(() => this.repository.claimCleanupRetry(sellerId, assetId));
    if (claim.result !== "deleting") throw notReady();

    try {
      await this.deleteStoredImage(claim.objectKey);
      return publicAsset(
        await this.database(() => this.repository.completeRemoval(sellerId, assetId)),
      );
    } catch (error) {
      await this.database(() => this.repository.failRemoval(sellerId, assetId));
      throw cleanupRequired();
    }
  }

  async getPrivate(
    assetId: string,
    authorization: { sellerId: string | null; prototypeAdministrator: boolean },
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const asset = await this.database(() => this.repository.findById(assetId));
    if (
      !asset ||
      asset.status !== "available" ||
      (asset.sellerId !== authorization.sellerId && !authorization.prototypeAdministrator)
    ) {
      throw imageNotFound();
    }
    return this.readDelivery(asset);
  }

  async getPublic(
    sellerId: string,
    kind: SellerProfileAssetKind,
    revision: number,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const asset = await this.database(() => this.repository.findPublic(sellerId, kind, revision));
    if (!asset) throw imageNotFound();
    return this.readDelivery(asset);
  }

  private async requireOwned(sellerId: string, assetId: string): Promise<SellerProfileAssetRecord> {
    const asset = await this.database(() => this.repository.findOwned(sellerId, assetId));
    if (!asset) throw imageNotFound();
    return asset;
  }

  private async readDelivery(
    asset: SellerProfileAssetRecord,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const stored = await this.readStoredImage(asset.objectKey);
    if (
      !stored ||
      stored.contentType !== asset.contentType ||
      stored.sizeBytes !== asset.sizeBytes ||
      stored.bytes.byteLength !== asset.sizeBytes
    ) {
      throw storageUnavailable();
    }
    return { bytes: stored.bytes, contentType: asset.contentType };
  }

  private async readStoredImage(path: string): Promise<SellerProfileStoredImage | null> {
    return withStorageTimeout((signal) => this.storage.read(path, signal));
  }

  private async deleteStoredImage(path: string): Promise<void> {
    await withStorageTimeout((signal) => this.storage.delete(path, signal));
  }

  private async database<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }
}

async function isValidStoredImage(
  asset: SellerProfileAssetRecord,
  stored: SellerProfileStoredImage,
): Promise<boolean> {
  return (
    stored.contentType === asset.contentType &&
    stored.sizeBytes === asset.sizeBytes &&
    stored.bytes.byteLength === asset.sizeBytes &&
    stored.bytes.byteLength <= SELLER_PROFILE_IMAGE_MAX_SIZE_BYTES &&
    (await decodeSellerProfileImage(stored.bytes, asset.contentType))
  );
}

async function withStorageTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_OPERATION_TIMEOUT_MS);
  try {
    return await operation(controller.signal);
  } catch (error) {
    throw mapStorageError(error);
  } finally {
    clearTimeout(timer);
  }
}

function mapDatabaseError(error: unknown): SellerProfileImageError {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("seller_profile_image_invalid")) return invalidImage();
  if (message.includes("seller_profile_image_required_owner")) return requiredOwner();
  if (message.includes("seller_profile_image_not_found")) return imageNotFound();
  if (message.includes("seller_profile_image_conflict")) {
    return new SellerProfileImageError(
      409,
      "seller_profile_image_conflict",
      "This upload request was already used for different image metadata.",
    );
  }
  if (message.includes("seller_profile_image_cleanup_required")) return cleanupRequired();
  if (message.includes("seller_profile_image_not_ready")) return notReady();
  console.error("[Seller profile image] Database operation failed.", {
    databaseCode:
      error instanceof Error && "databaseCode" in error
        ? String((error as Error & { databaseCode?: unknown }).databaseCode ?? "unknown")
        : "unknown",
    message: message || "unknown",
  });
  return storageUnavailable();
}

function mapStorageError(error: unknown): SellerProfileImageError {
  if (error instanceof SellerProfileImageError) return error;
  return storageUnavailable();
}

function publicAsset(asset: SellerProfileAssetRecord): SellerProfileAsset {
  return {
    assetId: asset.assetId,
    sellerId: asset.sellerId,
    kind: asset.kind,
    originalFilename: asset.originalFilename,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    status: asset.status,
    errorCode: asset.errorCode,
  };
}

function invalidImage(): SellerProfileImageError {
  return new SellerProfileImageError(
    400,
    "seller_profile_image_invalid",
    "Choose a valid JPEG, PNG, or WebP image no larger than 20 MB.",
  );
}

function requiredOwner(): SellerProfileImageError {
  return new SellerProfileImageError(
    403,
    "seller_profile_image_required_owner",
    "A seller profile is required to manage profile images.",
  );
}

function imageNotFound(): SellerProfileImageError {
  return new SellerProfileImageError(
    404,
    "seller_profile_image_not_found",
    "The seller profile image was not found.",
  );
}

function notReady(): SellerProfileImageError {
  return new SellerProfileImageError(
    409,
    "seller_profile_image_not_ready",
    "The seller profile image is not ready for this operation.",
  );
}

function cleanupRequired(): SellerProfileImageError {
  return new SellerProfileImageError(
    409,
    "seller_profile_image_cleanup_required",
    "The seller profile image cleanup must be retried.",
  );
}

function storageUnavailable(): SellerProfileImageError {
  return new SellerProfileImageError(
    503,
    "seller_profile_image_storage_unavailable",
    "Seller profile image storage is temporarily unavailable.",
  );
}
