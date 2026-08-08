import {
  PRODUCT_DRAFT_IMAGE_SIGNED_UPLOAD_LIFETIME_SECONDS,
  ProductDraftImageLifecycleError,
  type FinalizeProductDraftImageUploadsInput,
  type FinalizeProductDraftImageUploadsResponse,
  type FinalizedProductDraftImage,
  type PrepareProductDraftImageUploadsInput,
  type PrepareProductDraftImageUploadsResponse,
  type ProductDraftImageGalleryMutationResponse,
  type RemoveProductDraftImageInput,
  type RetryProductDraftImageCleanupInput,
  type UpdateProductDraftImageGalleryInput,
} from "../product-draft-image-lifecycle.types";
import type {
  FinalizeProductDraftImageRecord,
  ProductDraftImageLifecycleRecord,
  ProductDraftImageLifecycleRepository,
} from "./product-draft-image-lifecycle.repository";
import {
  hasMatchingImageSignature,
  ProductDraftImageLifecycleStorageError,
  type ProductDraftImageLifecycleStorage,
} from "./product-draft-image-lifecycle.storage";

const STORAGE_CONCURRENCY = 5;
const STORAGE_OPERATION_TIMEOUT_MS = 10_000;
const FINALIZE_REQUEST_TIMEOUT_MS = 60_000;

export class ProductDraftImageLifecycleService {
  constructor(
    private readonly repository: ProductDraftImageLifecycleRepository,
    private readonly storage: ProductDraftImageLifecycleStorage,
    private readonly now: () => number = Date.now,
  ) {}

  async prepare(
    sellerId: string,
    input: PrepareProductDraftImageUploadsInput,
  ): Promise<PrepareProductDraftImageUploadsResponse> {
    const existing = await this.repository.listByClientUploadIds(
      input.productDraftId,
      sellerId,
      input.files.map((file) => file.clientUploadId),
    );
    const verifiedAbsentImageIds: string[] = [];
    for (const image of existing) {
      if (image.durableStatus !== "failed") continue;
      try {
        await this.ensureAbsent(image.destinationKey);
      } catch {
        await this.repository.failUploadCleanup({
          productDraftId: input.productDraftId,
          sellerId,
          imageId: image.imageId,
        });
        throw new ProductDraftImageLifecycleError(
          503,
          "product_draft_image_upload_cleanup_failed",
          "The previous private upload could not be cleaned up. Cleanup can be retried.",
        );
      }
      verifiedAbsentImageIds.push(image.imageId);
    }

    const prepared = await this.repository.prepare({
      productDraftId: input.productDraftId,
      sellerId,
      expectedGalleryRevision: input.expectedGalleryRevision,
      files: input.files,
      verifiedAbsentImageIds,
    });
    if (prepared.result !== "prepared" || prepared.galleryRevision === null) {
      throw prepareError(prepared.result);
    }

    const uploadExpiresAt = new Date(
      this.now() + PRODUCT_DRAFT_IMAGE_SIGNED_UPLOAD_LIFETIME_SECONDS * 1000,
    ).toISOString();
    const images = await Promise.all(
      prepared.images.map(async (image) => {
        if (image.durableStatus === "available") {
          return {
            imageId: image.imageId,
            clientUploadId: image.clientUploadId,
            originalFilename: image.originalFilename,
            contentType: image.contentType,
            sizeBytes: image.sizeBytes,
            durableStatus: "available" as const,
            uploadPath: null,
            uploadToken: null,
            uploadExpiresAt: null,
          };
        }
        if (image.durableStatus !== "pending") throw storageUnavailable();
        let signed;
        try {
          signed = await this.storage.createSignedUpload(image.destinationKey);
        } catch (error) {
          throw mapStorageError(error);
        }
        return {
          imageId: image.imageId,
          clientUploadId: image.clientUploadId,
          originalFilename: image.originalFilename,
          contentType: image.contentType,
          sizeBytes: image.sizeBytes,
          durableStatus: "pending" as const,
          uploadPath: signed.path,
          uploadToken: signed.token,
          uploadExpiresAt,
        };
      }),
    );

    return {
      productDraftId: input.productDraftId,
      galleryRevision: prepared.galleryRevision,
      images,
    };
  }

  async finalize(
    sellerId: string,
    input: FinalizeProductDraftImageUploadsInput,
  ): Promise<FinalizeProductDraftImageUploadsResponse> {
    const records = await this.repository.listByImageIds(
      input.productDraftId,
      sellerId,
      input.imageIds,
    );
    const byId = new Map(records.map((record) => [record.imageId, record]));
    if (input.imageIds.some((imageId) => !byId.has(imageId))) throw imageNotFound();

    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), FINALIZE_REQUEST_TIMEOUT_MS);
    try {
      const verified = await runWithConcurrency(
        input.imageIds.map((imageId) => byId.get(imageId)!),
        STORAGE_CONCURRENCY,
        (record) => this.verifyForFinalization(record, deadline.signal),
      );
      const persisted = await this.repository.finalize({
        productDraftId: input.productDraftId,
        sellerId,
        results: verified.map((result) => result.database),
      });
      if (persisted.result === "not_found" || persisted.result === "image_not_found") {
        throw imageNotFound();
      }
      if (persisted.result === "gallery_locked") throw galleryLocked();
      if (persisted.result !== "finalized") throw storageUnavailable();

      return {
        productDraftId: input.productDraftId,
        galleryRevision: persisted.galleryRevision,
        images: verified.map((result) => result.response),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async update(
    sellerId: string,
    input: UpdateProductDraftImageGalleryInput,
  ): Promise<ProductDraftImageGalleryMutationResponse> {
    const result = await this.repository.update({ ...input, sellerId });
    if (result.result === "updated" || result.result === "unchanged") {
      return {
        productDraftId: input.productDraftId,
        galleryRevision: result.galleryRevision,
      };
    }
    throw mutationError(result.result);
  }

  async retryCleanup(
    sellerId: string,
    input: RetryProductDraftImageCleanupInput,
  ): Promise<ProductDraftImageGalleryMutationResponse> {
    const records = await this.repository.listByImageIds(input.productDraftId, sellerId, [
      input.imageId,
    ]);
    const record = records[0];
    if (!record) throw imageNotFound();
    if (
      record.durableStatus !== "failed" ||
      record.lifecycleErrorCode !== "product_draft_image_upload_cleanup_failed"
    ) {
      throw invalidUpload();
    }

    await this.ensureAbsent(record.destinationKey);
    const completed = await this.repository.completeUploadCleanup({
      productDraftId: input.productDraftId,
      sellerId,
      imageId: input.imageId,
    });
    if (completed.result !== "cleanup_completed" && completed.result !== "noop") {
      throw mutationError(completed.result);
    }
    return {
      productDraftId: input.productDraftId,
      galleryRevision: completed.galleryRevision,
    };
  }

  async remove(
    sellerId: string,
    input: RemoveProductDraftImageInput,
  ): Promise<ProductDraftImageGalleryMutationResponse> {
    const begun = await this.repository.beginRemoval({ ...input, sellerId });
    if (begun.result !== "cleanup_required" || !begun.destinationKey) {
      throw mutationError(begun.result);
    }

    try {
      await this.ensureAbsent(begun.destinationKey);
      const completed = await this.repository.completeRemoval({
        productDraftId: input.productDraftId,
        sellerId,
        imageId: input.imageId,
      });
      if (completed.result !== "removed") throw mutationError(completed.result);
      return {
        productDraftId: input.productDraftId,
        galleryRevision: completed.galleryRevision,
      };
    } catch (error) {
      await this.repository.failRemoval({
        productDraftId: input.productDraftId,
        sellerId,
        imageId: input.imageId,
      });
      if (error instanceof ProductDraftImageLifecycleError) throw error;
      throw new ProductDraftImageLifecycleError(
        503,
        "product_draft_image_delete_failed",
        "The private image could not be removed. Cleanup can be retried.",
      );
    }
  }

  private async verifyForFinalization(
    record: ProductDraftImageLifecycleRecord,
    deadlineSignal: AbortSignal,
  ): Promise<{
    database: FinalizeProductDraftImageRecord;
    response: FinalizedProductDraftImage;
  }> {
    if (record.durableStatus === "available") {
      return availableResult(record);
    }
    if (record.durableStatus === "failed") {
      return failedResult(
        record,
        record.lifecycleErrorCode ?? "product_draft_image_verification_failed",
      );
    }
    if (record.durableStatus === "deleting") throw galleryLocked();

    let object;
    try {
      object = await withOperationTimeout(deadlineSignal, (signal) =>
        this.storage.inspect(record.destinationKey, signal),
      );
    } catch (error) {
      throw mapStorageError(error);
    }
    if (!object) return failedResult(record, "product_draft_image_object_missing");

    const valid =
      object.contentType === record.contentType &&
      object.sizeBytes === record.sizeBytes &&
      hasMatchingImageSignature(record.contentType, object.signatureBytes);
    if (valid) return availableResult(record);

    try {
      await withOperationTimeout(deadlineSignal, (signal) =>
        this.storage.delete(record.destinationKey, signal),
      );
      const remaining = await withOperationTimeout(deadlineSignal, (signal) =>
        this.storage.inspect(record.destinationKey, signal),
      );
      if (remaining) {
        return failedResult(record, "product_draft_image_upload_cleanup_failed");
      }
      return failedResult(record, "product_draft_image_verification_failed");
    } catch {
      return failedResult(record, "product_draft_image_upload_cleanup_failed");
    }
  }

  private async ensureAbsent(destinationKey: string): Promise<void> {
    const controller = new AbortController();
    try {
      const current = await withOperationTimeout(controller.signal, (signal) =>
        this.storage.inspect(destinationKey, signal),
      );
      if (!current) return;
      await withOperationTimeout(controller.signal, (signal) =>
        this.storage.delete(destinationKey, signal),
      );
      if (
        await withOperationTimeout(controller.signal, (signal) =>
          this.storage.inspect(destinationKey, signal),
        )
      ) {
        throw storageUnavailable();
      }
    } catch (error) {
      throw mapStorageError(error);
    }
  }
}

function availableResult(record: ProductDraftImageLifecycleRecord) {
  return {
    database: {
      imageId: record.imageId,
      outcome: "available" as const,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
    },
    response: {
      imageId: record.imageId,
      durableStatus: "available" as const,
      lifecycleErrorCode: null,
    },
  };
}

function failedResult(record: ProductDraftImageLifecycleRecord, errorCode: string) {
  const databaseErrorCode = isFinalizeErrorCode(errorCode)
    ? errorCode
    : "product_draft_image_verification_failed";
  return {
    database: {
      imageId: record.imageId,
      outcome: "failed" as const,
      errorCode: databaseErrorCode,
    },
    response: {
      imageId: record.imageId,
      durableStatus: "failed" as const,
      lifecycleErrorCode: errorCode,
    },
  };
}

function isFinalizeErrorCode(
  value: string,
): value is NonNullable<FinalizeProductDraftImageRecord["errorCode"]> {
  return (
    value === "product_draft_image_object_missing" ||
    value === "product_draft_image_verification_failed" ||
    value === "product_draft_image_upload_cleanup_failed"
  );
}

function prepareError(result: string): ProductDraftImageLifecycleError {
  if (result === "not_found") return imageNotFound();
  if (result === "stale") return galleryStale();
  if (result === "limit_exceeded") {
    return new ProductDraftImageLifecycleError(
      409,
      "product_draft_image_upload_limit_exceeded",
      "A ProductDraft can contain at most 20 images.",
    );
  }
  if (result === "upload_conflict") {
    return new ProductDraftImageLifecycleError(
      409,
      "product_draft_image_upload_conflict",
      "An upload identifier was already used for a different file.",
    );
  }
  if (result === "cleanup_required") {
    return new ProductDraftImageLifecycleError(
      409,
      "product_draft_image_upload_cleanup_failed",
      "The previous private upload must be cleaned up before retrying.",
    );
  }
  if (result === "verification_required") {
    return new ProductDraftImageLifecycleError(
      409,
      "product_draft_image_verification_failed",
      "The previous private upload must be verified before retrying.",
    );
  }
  if (result === "gallery_locked" || result === "not_editable" || result === "not_allowed") {
    return galleryLocked();
  }
  return invalidUpload();
}

function mutationError(result: string): ProductDraftImageLifecycleError {
  if (result === "not_found" || result === "image_not_found") return imageNotFound();
  if (result === "stale") return galleryStale();
  if (result === "gallery_incomplete") {
    return new ProductDraftImageLifecycleError(
      409,
      "product_draft_image_gallery_incomplete",
      "Resolve pending image work before changing the gallery.",
    );
  }
  if (result === "gallery_locked" || result === "not_editable" || result === "not_allowed") {
    return galleryLocked();
  }
  return invalidUpload();
}

function invalidUpload(): ProductDraftImageLifecycleError {
  return new ProductDraftImageLifecycleError(
    400,
    "product_draft_image_upload_invalid",
    "The ProductDraft image request is invalid.",
  );
}

function imageNotFound(): ProductDraftImageLifecycleError {
  return new ProductDraftImageLifecycleError(
    404,
    "product_draft_image_not_found",
    "The ProductDraft image was not found.",
  );
}

function galleryStale(): ProductDraftImageLifecycleError {
  return new ProductDraftImageLifecycleError(
    409,
    "product_draft_image_gallery_stale",
    "The ProductDraft image gallery changed in another request.",
  );
}

function galleryLocked(): ProductDraftImageLifecycleError {
  return new ProductDraftImageLifecycleError(
    409,
    "product_draft_image_gallery_locked",
    "The ProductDraft image gallery cannot be changed in its current state.",
  );
}

function storageUnavailable(): ProductDraftImageLifecycleError {
  return new ProductDraftImageLifecycleError(
    503,
    "product_draft_image_storage_unavailable",
    "Private ProductDraft image storage is temporarily unavailable.",
  );
}

function mapStorageError(error: unknown): ProductDraftImageLifecycleError {
  if (error instanceof ProductDraftImageLifecycleError) return error;
  if (error instanceof ProductDraftImageLifecycleStorageError) return storageUnavailable();
  return storageUnavailable();
}

async function withOperationTimeout<T>(
  parentSignal: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, STORAGE_OPERATION_TIMEOUT_MS);
  parentSignal.addEventListener("abort", abort, { once: true });
  if (parentSignal.aborted) controller.abort();
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", abort);
  }
}

async function runWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const run = async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await worker(values[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}
