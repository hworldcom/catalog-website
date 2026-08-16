import { createHash } from "node:crypto";

import type { ProductActivationConfig } from "./product-activation.config";
import type { ProductActivationRepository } from "./product-activation.repository";
import {
  ProductActivationClaimLostError,
  ProductActivationWorkerError,
  type ClaimedProductActivation,
  type ClaimedProductActivationCleanup,
  type ProductActivationDispatchPayload,
  type ProductActivationItem,
  type ProductActivationWorkerErrorCode,
  type ProductActivationWorkerResult,
} from "./product-activation.types";
import type {
  ProductPublicationObject,
  ProductPublicationStorage,
} from "@/features/seller/server/product-publication.storage";
import { ProductPublicationStorageError } from "@/features/seller/server/product-publication.storage";

type ItemFailure = {
  item: ProductActivationItem;
  error: ProductActivationWorkerError;
};

export class ProductActivationWorker {
  constructor(
    private readonly repository: ProductActivationRepository,
    private readonly storage: ProductPublicationStorage,
    private readonly config: ProductActivationConfig,
  ) {}

  async run(payload: ProductActivationDispatchPayload): Promise<ProductActivationWorkerResult> {
    const claim = await this.repository.claimRun(payload, this.config.claimTimeoutSeconds);
    if (claim.result === "owned") return { status: "already_owned" };
    if (claim.result === "stale") return { status: "stale" };
    if (claim.result === "not_found") return { status: "idle" };

    try {
      return claim.phase === "activation"
        ? await this.executeClaimed(claim)
        : await this.executeCleanupClaimed(claim);
    } catch (error) {
      if (error instanceof ProductActivationClaimLostError) {
        return claimedResult(claim, "claim_lost");
      }
      return claim.phase === "activation"
        ? this.closeUnexpectedFailure(claim)
        : this.closeUnexpectedCleanupFailure(claim);
    }
  }

  private async executeClaimed(
    claim: ClaimedProductActivation,
  ): Promise<ProductActivationWorkerResult> {
    const deadline = new AbortController();
    const deadlineTimer = setTimeout(() => deadline.abort(), this.config.workerDeadlineMs);
    try {
      if (claim.items.length < 1 || claim.items.length > this.config.maximumImageCount) {
        return this.fail(
          claim,
          claim.items[0] ?? invalidManifestItem(claim.productId),
          activationError("product_publication_finalization_failed"),
        );
      }

      const failure = await this.processItems(claim, deadline.signal);
      if (failure) return this.fail(claim, failure.item, failure.error);

      let finalization: Awaited<ReturnType<ProductActivationRepository["finalize"]>>;
      try {
        finalization = await this.repository.finalize({
          runId: claim.runId,
          dispatchGeneration: claim.dispatchGeneration,
          attemptToken: claim.attemptToken,
        });
      } catch {
        return this.fail(
          claim,
          claim.items[0]!,
          activationError("product_publication_finalization_failed"),
        );
      }
      if (finalization === "completed") {
        return claimedResult(claim, "completed");
      }
      if (finalization === "cleanup_pending") {
        const cleanup = await this.repository.continueCleanup({
          runId: claim.runId,
          dispatchGeneration: claim.dispatchGeneration,
          attemptToken: claim.attemptToken,
          claimTimeoutSeconds: this.config.claimTimeoutSeconds,
        });
        if (cleanup.result !== "claimed" || cleanup.phase === "activation") {
          return claimedResult(claim, "claim_lost");
        }
        return this.executeCleanupWithinDeadline(cleanup, deadline.signal);
      }
      if (finalization === "stale") return claimedResult(claim, "claim_lost");
      return this.fail(
        claim,
        claim.items[0]!,
        activationError("product_moderation_submission_stale"),
      );
    } finally {
      clearTimeout(deadlineTimer);
    }
  }

  private async executeCleanupClaimed(
    claim: ClaimedProductActivationCleanup,
  ): Promise<ProductActivationWorkerResult> {
    const deadline = new AbortController();
    const deadlineTimer = setTimeout(() => deadline.abort(), this.config.workerDeadlineMs);
    try {
      return await this.executeCleanupWithinDeadline(claim, deadline.signal);
    } finally {
      clearTimeout(deadlineTimer);
    }
  }

  private async executeCleanupWithinDeadline(
    claim: ClaimedProductActivationCleanup,
    deadlineSignal: AbortSignal,
  ): Promise<ProductActivationWorkerResult> {
    const failureCode = await this.processCleanupItems(claim, deadlineSignal);
    const finalization = await this.repository.finalizeCleanup({
      runId: claim.runId,
      dispatchGeneration: claim.dispatchGeneration,
      attemptToken: claim.attemptToken,
    });
    if (finalization === "completed" || finalization === "abandoned") {
      return claimedResult(claim, finalization);
    }
    if (finalization === "cleanup_required") {
      return {
        ...claimedResult(claim, "cleanup_required"),
        errorCode: failureCode ?? "product_activation_cleanup_failed",
      };
    }
    return claimedResult(claim, "claim_lost");
  }

  private async processCleanupItems(
    claim: ClaimedProductActivationCleanup,
    deadlineSignal: AbortSignal,
  ): Promise<
    "product_activation_cleanup_destination_conflict" | "product_activation_cleanup_failed" | null
  > {
    let nextIndex = 0;
    let firstFailure:
      | "product_activation_cleanup_destination_conflict"
      | "product_activation_cleanup_failed"
      | null = null;
    const processNext = async () => {
      while (nextIndex < claim.cleanupItems.length) {
        const item = claim.cleanupItems[nextIndex++]!;
        const failure = await this.withItemTimeout(deadlineSignal, (signal) =>
          this.processCleanupItem(claim, item, signal),
        ).catch(async (error) => {
          if (error instanceof ProductActivationClaimLostError) throw error;
          await this.recordCleanupFailure(
            claim,
            item.destinationKey,
            "product_activation_cleanup_failed",
          );
          return "product_activation_cleanup_failed" as const;
        });
        firstFailure ??= failure;
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(this.config.itemConcurrency, claim.cleanupItems.length) },
        processNext,
      ),
    );
    return firstFailure;
  }

  private async processCleanupItem(
    claim: ClaimedProductActivationCleanup,
    item: ClaimedProductActivationCleanup["cleanupItems"][number],
    signal: AbortSignal,
  ): Promise<
    "product_activation_cleanup_destination_conflict" | "product_activation_cleanup_failed" | null
  > {
    let destination: ProductPublicationObject | null;
    try {
      destination = await this.storage.read("product-images", item.destinationKey, signal);
    } catch {
      await this.recordCleanupFailure(
        claim,
        item.destinationKey,
        "product_activation_cleanup_failed",
      );
      return "product_activation_cleanup_failed";
    }
    if (destination) {
      const digest = sha256(destination.bytes);
      if (
        destination.bytes.byteLength !== item.expectedSizeBytes ||
        digest !== item.expectedSha256 ||
        (item.expectedEtag !== null && destination.etag !== item.expectedEtag)
      ) {
        await this.recordCleanupFailure(
          claim,
          item.destinationKey,
          "product_activation_cleanup_destination_conflict",
        );
        return "product_activation_cleanup_destination_conflict";
      }
      try {
        await this.storage.deletePublicObject(item.destinationKey, signal);
      } catch {
        await this.recordCleanupFailure(
          claim,
          item.destinationKey,
          "product_activation_cleanup_failed",
        );
        return "product_activation_cleanup_failed";
      }
    }

    const result = await this.repository.recordCleanupItemResult({
      runId: claim.runId,
      dispatchGeneration: claim.dispatchGeneration,
      attemptToken: claim.attemptToken,
      destinationKey: item.destinationKey,
      result: "completed",
      errorCode: null,
    });
    if (result === "stale") throw new ProductActivationClaimLostError();
    return null;
  }

  private async recordCleanupFailure(
    claim: ClaimedProductActivationCleanup,
    destinationKey: string,
    errorCode:
      "product_activation_cleanup_destination_conflict" | "product_activation_cleanup_failed",
  ): Promise<void> {
    const result = await this.repository.recordCleanupItemResult({
      runId: claim.runId,
      dispatchGeneration: claim.dispatchGeneration,
      attemptToken: claim.attemptToken,
      destinationKey,
      result: "failed",
      errorCode,
    });
    if (result === "stale") throw new ProductActivationClaimLostError();
  }

  private async processItems(
    claim: ClaimedProductActivation,
    deadlineSignal: AbortSignal,
  ): Promise<ItemFailure | null> {
    let nextIndex = 0;
    let firstFailure: ItemFailure | null = null;
    const processNext = async () => {
      while (!firstFailure && nextIndex < claim.items.length) {
        const item = claim.items[nextIndex++]!;
        try {
          await this.withItemTimeout(deadlineSignal, (signal) =>
            this.processItem(claim, item, signal),
          );
        } catch (error) {
          if (error instanceof ProductActivationClaimLostError) throw error;
          firstFailure = { item, error: asActivationError(error, item.productDraftImageId) };
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(this.config.itemConcurrency, claim.items.length) },
        processNext,
      ),
    );
    return firstFailure;
  }

  private async processItem(
    claim: ClaimedProductActivation,
    item: ProductActivationItem,
    signal: AbortSignal,
  ): Promise<void> {
    const source = await this.readSource(item, signal);
    const sourceSha256 = sha256(source.bytes);
    if (item.sourceSha256 && item.sourceSha256 !== sourceSha256) {
      throw activationError("product_publication_source_changed", item.productDraftImageId);
    }

    let destination = await this.readDestination(item, signal);
    let createdByCurrentAttempt = false;
    if (!destination) {
      let creation: "created" | "already_exists";
      try {
        creation = await this.storage.createPublicObject({
          objectKey: item.destinationKey,
          bytes: source.bytes,
          contentType: item.expectedContentType,
          metadata: {
            runId: claim.runId,
            productId: claim.productId,
            productDraftImageId: item.productDraftImageId,
            sha256: sourceSha256,
          },
          signal,
        });
      } catch (error) {
        throw mapTransferError(error, item.productDraftImageId);
      }
      createdByCurrentAttempt = creation === "created";
      if (creation === "already_exists" && !item.objectCreatedByAttemptToken) {
        throw activationError("product_publication_destination_conflict", item.productDraftImageId);
      }
      if (createdByCurrentAttempt) {
        const recorded = await this.repository.recordObjectCreated({
          runId: claim.runId,
          dispatchGeneration: claim.dispatchGeneration,
          attemptToken: claim.attemptToken,
          productDraftImageId: item.productDraftImageId,
          sourceSha256,
          publicSizeBytes: source.bytes.byteLength,
          publicSha256: sourceSha256,
          publicEtag: null,
          publicUrl: this.storage.publicUrl(item.destinationKey),
        });
        if (recorded === "stale") throw new ProductActivationClaimLostError();
        if (recorded === "conflict") {
          throw activationError(
            "product_publication_destination_conflict",
            item.productDraftImageId,
          );
        }
      }
      destination = await this.readDestination(item, signal);
      if (!destination) {
        throw activationError("product_publication_verification_failed", item.productDraftImageId);
      }
    } else if (!item.objectCreatedByAttemptToken) {
      throw activationError("product_publication_destination_conflict", item.productDraftImageId);
    }

    const destinationSha256 = sha256(destination.bytes);
    if (
      destination.contentType !== item.expectedContentType ||
      destination.bytes.byteLength !== item.expectedSourceSizeBytes ||
      destinationSha256 !== sourceSha256
    ) {
      throw activationError(
        createdByCurrentAttempt
          ? "product_publication_verification_failed"
          : "product_publication_destination_conflict",
        item.productDraftImageId,
      );
    }

    const verified = await this.repository.verifyItem({
      runId: claim.runId,
      dispatchGeneration: claim.dispatchGeneration,
      attemptToken: claim.attemptToken,
      productDraftImageId: item.productDraftImageId,
      verifiedSizeBytes: destination.bytes.byteLength,
      verifiedSha256: destinationSha256,
      verifiedEtag: destination.etag,
    });
    if (verified === "stale") throw new ProductActivationClaimLostError();
    if (verified === "conflict") {
      throw activationError("product_publication_verification_failed", item.productDraftImageId);
    }
  }

  private async readSource(
    item: ProductActivationItem,
    signal: AbortSignal,
  ): Promise<ProductPublicationObject> {
    let source: ProductPublicationObject | null;
    try {
      source = await this.storage.read(item.sourceBucket, item.sourceObjectKey, signal);
    } catch {
      throw activationError("product_publication_source_unavailable", item.productDraftImageId);
    }
    if (!source) {
      throw activationError("product_publication_source_unavailable", item.productDraftImageId);
    }
    if (
      source.contentType !== item.expectedContentType ||
      source.bytes.byteLength !== item.expectedSourceSizeBytes
    ) {
      throw activationError("product_publication_source_changed", item.productDraftImageId);
    }
    return source;
  }

  private async readDestination(
    item: ProductActivationItem,
    signal: AbortSignal,
  ): Promise<ProductPublicationObject | null> {
    try {
      return await this.storage.read("product-images", item.destinationKey, signal);
    } catch (error) {
      throw mapTransferError(error, item.productDraftImageId);
    }
  }

  private async fail(
    claim: ClaimedProductActivation,
    item: ProductActivationItem,
    error: ProductActivationWorkerError,
  ): Promise<ProductActivationWorkerResult> {
    const result = await this.repository.failAttempt({
      runId: claim.runId,
      dispatchGeneration: claim.dispatchGeneration,
      attemptToken: claim.attemptToken,
      productDraftImageId: item.productDraftImageId,
      errorCode: error.code,
    });
    if (result === "stale") return claimedResult(claim, "claim_lost");
    return {
      ...claimedResult(claim, "failed"),
      errorCode: error.code,
    };
  }

  private async closeUnexpectedFailure(
    claim: ClaimedProductActivation,
  ): Promise<ProductActivationWorkerResult> {
    const item = claim.items[0];
    if (!item) return claimedResult(claim, "claim_lost");
    try {
      return await this.fail(
        claim,
        item,
        activationError("product_publication_finalization_failed", item.productDraftImageId),
      );
    } catch {
      return claimedResult(claim, "claim_lost");
    }
  }

  private async closeUnexpectedCleanupFailure(
    claim: ClaimedProductActivationCleanup,
  ): Promise<ProductActivationWorkerResult> {
    const item = claim.cleanupItems[0];
    if (!item) return claimedResult(claim, "claim_lost");
    try {
      await this.recordCleanupFailure(
        claim,
        item.destinationKey,
        "product_activation_cleanup_failed",
      );
      const finalization = await this.repository.finalizeCleanup({
        runId: claim.runId,
        dispatchGeneration: claim.dispatchGeneration,
        attemptToken: claim.attemptToken,
      });
      if (finalization === "cleanup_required") {
        return {
          ...claimedResult(claim, "cleanup_required"),
          errorCode: "product_activation_cleanup_failed",
        };
      }
      return claimedResult(claim, "claim_lost");
    } catch {
      return claimedResult(claim, "claim_lost");
    }
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

function activationError(
  code: ProductActivationWorkerErrorCode,
  productDraftImageId?: string,
): ProductActivationWorkerError {
  return new ProductActivationWorkerError(code, productDraftImageId);
}

function asActivationError(
  error: unknown,
  productDraftImageId: string,
): ProductActivationWorkerError {
  if (error instanceof ProductActivationWorkerError) return error;
  if (error instanceof ProductPublicationStorageError) {
    return mapTransferError(error, productDraftImageId);
  }
  return activationError("product_publication_transfer_failed", productDraftImageId);
}

function mapTransferError(
  _error: unknown,
  productDraftImageId: string,
): ProductActivationWorkerError {
  return activationError("product_publication_transfer_failed", productDraftImageId);
}

function claimedResult(
  claim: ClaimedProductActivation | ClaimedProductActivationCleanup,
  status:
    "completed" | "abandoned" | "cleanup_pending" | "cleanup_required" | "failed" | "claim_lost",
): Extract<ProductActivationWorkerResult, { runId: string }> {
  return {
    status,
    runId: claim.runId,
    dispatchGeneration: claim.dispatchGeneration,
    attemptCount: claim.attemptCount,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function invalidManifestItem(productId: string): ProductActivationItem {
  return {
    productDraftImageId: productId,
    sourceBucket: "product-draft-images",
    sourceObjectKey: "invalid",
    destinationKey: "invalid",
    sourcePosition: 0,
    publicationOrder: 0,
    isCover: true,
    expectedSourceSizeBytes: 1,
    expectedContentType: "image/jpeg",
    sourceSha256: null,
    publicSizeBytes: null,
    publicSha256: null,
    publicEtag: null,
    publicUrl: null,
    objectCreatedByAttemptToken: null,
  };
}
