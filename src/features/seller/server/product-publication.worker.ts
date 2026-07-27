import { createHash } from "node:crypto";

import type { ProductPublicationConfig } from "./product-publication.config";
import type { ProductPublicationRepository } from "./product-publication.repository";
import type {
  ProductPublicationObject,
  ProductPublicationStorage,
} from "./product-publication.storage";
import { ProductPublicationStorageError } from "./product-publication.storage";
import {
  ProductPublicationClaimLostError,
  ProductPublicationError,
  type ProductPublicationErrorCode,
  type ProductPublicationItem,
  type ProductPublicationRun,
  type ProductPublicationWorkerResult,
} from "./product-publication.types";

type ItemFailure = {
  item: ProductPublicationItem;
  error: ProductPublicationError;
};

export class ProductPublicationWorker {
  constructor(
    private readonly repository: ProductPublicationRepository,
    private readonly storage: ProductPublicationStorage,
    private readonly config: ProductPublicationConfig,
  ) {}

  async run(productDraftId: string): Promise<ProductPublicationWorkerResult> {
    const claimed = await this.repository.claimRun(productDraftId, this.config.claimTimeoutSeconds);
    if (!claimed) {
      const current = await this.repository.getRun(productDraftId);
      return current ? { status: "already_terminal", productDraftId } : { status: "idle" };
    }
    try {
      return await this.executeClaimed(claimed);
    } catch {
      return this.closeUnexpectedFailure(claimed);
    }
  }

  async reconcileCleanup(productDraftId: string): Promise<boolean> {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), this.config.workerDeadlineMs);
    try {
      await this.cleanup(productDraftId, deadline.signal);
      return (await this.repository.getRun(productDraftId))?.status !== "cleanup_required";
    } finally {
      clearTimeout(timer);
    }
  }

  private async executeClaimed(
    run: ProductPublicationRun,
  ): Promise<ProductPublicationWorkerResult> {
    const attemptToken = run.attemptToken;
    if (!attemptToken) throw new Error("Claimed product publication has no attempt token.");

    const deadline = new AbortController();
    const deadlineTimer = setTimeout(() => deadline.abort(), this.config.workerDeadlineMs);
    try {
      const items = await this.repository.listItems(run.productDraftId);
      if (
        items.length === 0 ||
        items.length > this.config.maximumImageCount ||
        items.some((item) => item.status !== "copying" || item.attemptToken !== attemptToken)
      ) {
        return await this.fail(
          run,
          attemptToken,
          {
            item: items[0] ?? emptyFailureItem(run.productDraftId),
            error: publicationError(
              "product_publication_finalization_failed",
              true,
              items[0]?.productDraftImageId,
            ),
          },
          deadline.signal,
        );
      }

      const failure = await this.processItems(items, attemptToken, deadline.signal);
      if (failure) return await this.fail(run, attemptToken, failure, deadline.signal);

      let finalization: Awaited<ReturnType<ProductPublicationRepository["finalize"]>>;
      try {
        finalization = await this.repository.finalize({
          productDraftId: run.productDraftId,
          sellerId: run.sellerId,
          attemptToken,
        });
      } catch {
        return await this.fail(
          run,
          attemptToken,
          {
            item: items[0]!,
            error: publicationError(
              "product_publication_finalization_failed",
              true,
              items[0]!.productDraftImageId,
            ),
          },
          deadline.signal,
        );
      }

      if (finalization === "completed") {
        return {
          status: "completed",
          productDraftId: run.productDraftId,
          attemptCount: run.attemptCount,
        };
      }
      if (finalization === "stale_attempt") {
        return {
          status: "claim_lost",
          productDraftId: run.productDraftId,
          attemptCount: run.attemptCount,
        };
      }
      return await this.fail(
        run,
        attemptToken,
        {
          item: items[0]!,
          error: publicationError(
            "product_publication_finalization_failed",
            true,
            items[0]!.productDraftImageId,
          ),
        },
        deadline.signal,
      );
    } finally {
      clearTimeout(deadlineTimer);
    }
  }

  private async closeUnexpectedFailure(
    run: ProductPublicationRun,
  ): Promise<ProductPublicationWorkerResult> {
    const attemptToken = run.attemptToken;
    if (!attemptToken) {
      return {
        status: "claim_lost",
        productDraftId: run.productDraftId,
        attemptCount: run.attemptCount,
      };
    }

    const closed = await this.repository.failClaimedRun({
      productDraftId: run.productDraftId,
      attemptToken,
      errorCode: "product_publication_finalization_failed",
    });
    if (!closed) {
      return {
        status: "claim_lost",
        productDraftId: run.productDraftId,
        attemptCount: run.attemptCount,
      };
    }

    const cleanupDeadline = new AbortController();
    const timer = setTimeout(() => cleanupDeadline.abort(), this.config.workerDeadlineMs);
    try {
      try {
        await this.cleanup(run.productDraftId, cleanupDeadline.signal);
      } catch {
        // The token-fenced failure is durable. Cleanup remains explicitly recoverable.
      }
    } finally {
      clearTimeout(timer);
    }

    const current = await this.repository.getRun(run.productDraftId);
    return {
      status: current?.status === "cleanup_required" ? "cleanup_required" : "failed",
      productDraftId: run.productDraftId,
      attemptCount: run.attemptCount,
      errorCode: "product_publication_finalization_failed",
    };
  }

  private async processItems(
    items: ProductPublicationItem[],
    attemptToken: string,
    deadlineSignal: AbortSignal,
  ): Promise<ItemFailure | null> {
    let nextIndex = 0;
    let firstFailure: ItemFailure | null = null;

    const processNext = async () => {
      while (!firstFailure && nextIndex < items.length) {
        const item = items[nextIndex++]!;
        try {
          await this.withItemTimeout(deadlineSignal, (signal) =>
            this.processItem(item, attemptToken, signal),
          );
        } catch (error) {
          if (error instanceof ProductPublicationClaimLostError) throw error;
          firstFailure = {
            item,
            error: asPublicationError(error, item.productDraftImageId),
          };
        }
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(this.config.itemConcurrency, items.length) }, processNext),
      );
    } catch (error) {
      if (error instanceof ProductPublicationClaimLostError) {
        return {
          item: items[0]!,
          error: publicationError(
            "product_publication_finalization_failed",
            true,
            items[0]!.productDraftImageId,
          ),
        };
      }
      throw error;
    }
    return firstFailure;
  }

  private async processItem(
    item: ProductPublicationItem,
    attemptToken: string,
    signal: AbortSignal,
  ): Promise<void> {
    const source = await this.readSource(item, signal);
    const sourceSha256 = sha256(source.bytes);
    if (item.sourceSha256 && item.sourceSha256 !== sourceSha256) {
      throw publicationError("product_publication_source_changed", false, item.productDraftImageId);
    }

    let destination = await this.readDestination(item, signal);
    let createdByCurrentAttempt = false;
    if (!destination) {
      if (
        item.objectCreatedByAttemptToken &&
        item.objectCreatedByAttemptToken !== attemptToken &&
        !(await this.repository.clearObjectOwnership({
          productDraftId: item.productDraftId,
          productDraftImageId: item.productDraftImageId,
          attemptToken,
          createdAttemptToken: item.objectCreatedByAttemptToken,
        }))
      ) {
        throw new ProductPublicationClaimLostError();
      }

      let createResult: "created" | "already_exists";
      try {
        createResult = await this.storage.createPublicObject({
          objectKey: item.destinationKey,
          bytes: source.bytes,
          metadata: {
            productDraftId: item.productDraftId,
            productDraftImageId: item.productDraftImageId,
            sha256: sourceSha256,
          },
          signal,
        });
      } catch (error) {
        throw mapTransferError(error, item.productDraftImageId);
      }
      createdByCurrentAttempt = createResult === "created";
      if (
        createdByCurrentAttempt &&
        !(await this.repository.recordObjectCreated({
          productDraftId: item.productDraftId,
          productDraftImageId: item.productDraftImageId,
          attemptToken,
          sourceSha256,
          publicUrl: this.storage.publicUrl(item.destinationKey),
        }))
      ) {
        throw new ProductPublicationClaimLostError();
      }
      destination = await this.readDestination(item, signal);
      if (!destination) {
        throw publicationError(
          "product_publication_verification_failed",
          true,
          item.productDraftImageId,
        );
      }
    }

    const destinationSha256 = sha256(destination.bytes);
    if (
      destination.contentType !== "image/jpeg" ||
      destination.bytes.byteLength !== item.expectedSourceSizeBytes ||
      destinationSha256 !== sourceSha256
    ) {
      throw publicationError(
        createdByCurrentAttempt
          ? "product_publication_verification_failed"
          : "product_publication_destination_conflict",
        createdByCurrentAttempt,
        item.productDraftImageId,
      );
    }

    if (
      !(await this.repository.verifyItem({
        productDraftId: item.productDraftId,
        productDraftImageId: item.productDraftImageId,
        attemptToken,
        sourceSha256,
        publicSizeBytes: destination.bytes.byteLength,
        publicSha256: destinationSha256,
        publicEtag: destination.etag,
        publicUrl: this.storage.publicUrl(item.destinationKey),
        createdByCurrentAttempt,
      }))
    ) {
      throw new ProductPublicationClaimLostError();
    }
  }

  private async readSource(
    item: ProductPublicationItem,
    signal: AbortSignal,
  ): Promise<ProductPublicationObject> {
    let source: ProductPublicationObject | null;
    try {
      source = await this.storage.read(item.sourceBucket, item.sourceObjectKey, signal);
    } catch {
      throw publicationError(
        "product_publication_source_unavailable",
        true,
        item.productDraftImageId,
      );
    }
    if (!source) {
      throw publicationError(
        "product_publication_source_unavailable",
        true,
        item.productDraftImageId,
      );
    }
    if (
      source.contentType !== item.expectedContentType ||
      source.bytes.byteLength !== item.expectedSourceSizeBytes
    ) {
      throw publicationError("product_publication_source_changed", false, item.productDraftImageId);
    }
    return source;
  }

  private async readDestination(
    item: ProductPublicationItem,
    signal: AbortSignal,
  ): Promise<ProductPublicationObject | null> {
    try {
      return await this.storage.read("product-images", item.destinationKey, signal);
    } catch (error) {
      throw mapTransferError(error, item.productDraftImageId);
    }
  }

  private async fail(
    run: ProductPublicationRun,
    attemptToken: string,
    failure: ItemFailure,
    deadlineSignal: AbortSignal,
  ): Promise<ProductPublicationWorkerResult> {
    if (
      !(await this.repository.failAttempt({
        productDraftId: run.productDraftId,
        productDraftImageId: failure.item.productDraftImageId,
        attemptToken,
        errorCode: failure.error.code,
      }))
    ) {
      return {
        status: "claim_lost",
        productDraftId: run.productDraftId,
        attemptCount: run.attemptCount,
      };
    }

    await this.cleanup(run.productDraftId, deadlineSignal);
    const current = await this.repository.getRun(run.productDraftId);
    return {
      status: current?.status === "cleanup_required" ? "cleanup_required" : "failed",
      productDraftId: run.productDraftId,
      attemptCount: run.attemptCount,
      errorCode:
        current?.errorCode && isPublicationErrorCode(current.errorCode)
          ? current.errorCode
          : failure.error.code,
    };
  }

  private async cleanup(productDraftId: string, deadlineSignal: AbortSignal): Promise<void> {
    const items = (await this.repository.listItems(productDraftId)).filter(
      (item) => item.status === "cleanup_required" && item.objectCreatedByAttemptToken,
    );
    for (const item of items) {
      const createdAttemptToken = item.objectCreatedByAttemptToken;
      if (
        !createdAttemptToken ||
        (await this.repository.hasPublishedImage(item.productDraftImageId))
      ) {
        continue;
      }
      try {
        await this.withItemTimeout(deadlineSignal, async (signal) => {
          const current = await this.storage.read("product-images", item.destinationKey, signal);
          if (current) {
            if (
              !item.publicSha256 ||
              current.bytes.byteLength !== item.publicSizeBytes ||
              sha256(current.bytes) !== item.publicSha256
            ) {
              return;
            }
            await this.storage.deletePublicObject(item.destinationKey, signal);
            if (await this.storage.read("product-images", item.destinationKey, signal)) return;
          }
          await this.repository.completeCleanup({
            productDraftId,
            productDraftImageId: item.productDraftImageId,
            createdAttemptToken,
          });
        });
      } catch {
        // The durable cleanup-required state remains for an explicit retry.
      }
    }
    await this.repository.finalizeCleanup(productDraftId);
  }

  private async withItemTimeout<T>(
    deadlineSignal: AbortSignal,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, this.config.itemTimeoutMs);
    deadlineSignal.addEventListener("abort", abort, { once: true });
    if (deadlineSignal.aborted) controller.abort();
    try {
      return await work(controller.signal);
    } finally {
      clearTimeout(timer);
      deadlineSignal.removeEventListener("abort", abort);
    }
  }
}

function publicationError(
  code: ProductPublicationErrorCode,
  retryable: boolean,
  productDraftImageId?: string,
): ProductPublicationError {
  return new ProductPublicationError(code, retryable, code, productDraftImageId);
}

function asPublicationError(error: unknown, productDraftImageId: string): ProductPublicationError {
  if (error instanceof ProductPublicationError) return error;
  if (error instanceof ProductPublicationStorageError) {
    return mapTransferError(error, productDraftImageId);
  }
  return publicationError("product_publication_transfer_failed", true, productDraftImageId);
}

function mapTransferError(error: unknown, productDraftImageId: string): ProductPublicationError {
  if (error instanceof ProductPublicationError) return error;
  return publicationError("product_publication_transfer_failed", true, productDraftImageId);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPublicationErrorCode(value: string): value is ProductPublicationErrorCode {
  return (
    value === "product_publication_dispatch_failed" ||
    value === "product_publication_source_unavailable" ||
    value === "product_publication_source_changed" ||
    value === "product_publication_destination_conflict" ||
    value === "product_publication_transfer_failed" ||
    value === "product_publication_verification_failed" ||
    value === "product_publication_cleanup_required" ||
    value === "product_publication_finalization_failed"
  );
}

function emptyFailureItem(productDraftId: string): ProductPublicationItem {
  return {
    productDraftId,
    productDraftImageId: productDraftId,
    sourceBucket: "product-draft-images",
    sourceObjectKey: "",
    destinationKey: "",
    sourcePosition: 0,
    publicationOrder: 0,
    isCover: true,
    expectedSourceSizeBytes: 1,
    expectedContentType: "image/jpeg",
    sourceSha256: null,
    status: "copying",
    attemptToken: null,
    publicSizeBytes: null,
    publicSha256: null,
    publicEtag: null,
    publicUrl: null,
    objectCreatedByAttemptToken: null,
    errorCode: null,
  };
}
