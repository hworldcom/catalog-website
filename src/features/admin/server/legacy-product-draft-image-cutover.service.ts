import { ClassifierImportError } from "./classifier-import.types";
import type { LegacyProductDraftImageCutoverRepository } from "./legacy-product-draft-image-cutover.repository";
import {
  LegacyProductDraftImageCutoverClaimLostError,
  type LegacyProductDraftImageCutoverErrorCode,
  type LegacyProductDraftImageReconciliationWorkItem,
  PRODUCT_DRAFT_IMAGE_CUTOVER_CLAIM_TIMEOUT_SECONDS,
  PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
  PRODUCT_DRAFT_IMAGE_RECONCILIATION_CLAIM_TIMEOUT_SECONDS,
  PRODUCT_DRAFT_IMAGE_RECONCILIATION_CONCURRENCY,
  PRODUCT_DRAFT_IMAGE_RECONCILIATION_DEADLINE_MS,
  type ProductDraftImageCutoverRunResult,
  type ProductDraftImageCutoverSummary,
  type ProductDraftImagePublicObjectState,
} from "./legacy-product-draft-image-cutover.types";
import {
  buildDestinationMetadata,
  type ClassifierImageObjectMetadata,
  type DestinationImageStorage,
  destinationObjectMatches,
  PRODUCT_DRAFT_IMAGE_BUCKET,
  PRODUCT_IMAGE_BUCKET,
} from "./destination-image-storage";

type TerminalReconciliation = {
  status: "completed" | "failed";
  publicObjectState: ProductDraftImagePublicObjectState;
  errorCode: LegacyProductDraftImageCutoverErrorCode | null;
  retryable: boolean;
  releaseBlocking: boolean;
  setPrivateBucket: boolean;
};

const completedAbsent = (setPrivateBucket: boolean): TerminalReconciliation => ({
  status: "completed",
  publicObjectState: "absent",
  errorCode: null,
  retryable: false,
  releaseBlocking: false,
  setPrivateBucket,
});

const completedDeleted: TerminalReconciliation = {
  status: "completed",
  publicObjectState: "deleted",
  errorCode: null,
  retryable: false,
  releaseBlocking: false,
  setPrivateBucket: true,
};

export class LegacyProductDraftImageCutoverService {
  constructor(
    private readonly repository: LegacyProductDraftImageCutoverRepository,
    private readonly storage: DestinationImageStorage,
  ) {}

  async run(batchSize: number): Promise<ProductDraftImageCutoverRunResult> {
    assertBatchSize(batchSize);
    const claimed = await this.repository.claimCutover({
      version: PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
      claimTimeoutSeconds: PRODUCT_DRAFT_IMAGE_CUTOVER_CLAIM_TIMEOUT_SECONDS,
    });
    if (!claimed?.attempt_token) {
      const summary = await this.repository.getSummary(PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION);
      if (summary.cutover.status === "completed") return { status: "completed", summary };
      return {
        status: "failed",
        errorCode: "legacy_cutover_claim_lost",
        summary,
      };
    }

    const attemptToken = claimed.attempt_token;
    let asynchronousHeartbeatFailure: unknown;
    let heartbeatInProgress = false;
    const heartbeat = setInterval(() => {
      if (heartbeatInProgress || asynchronousHeartbeatFailure) return;
      heartbeatInProgress = true;
      void this.repository
        .heartbeat(PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION, attemptToken)
        .then((owned) => {
          if (!owned)
            asynchronousHeartbeatFailure = new LegacyProductDraftImageCutoverClaimLostError();
        })
        .catch((error: unknown) => {
          asynchronousHeartbeatFailure = error;
        })
        .finally(() => {
          heartbeatInProgress = false;
        });
    }, 60_000);

    try {
      while (true) {
        if (asynchronousHeartbeatFailure) throw asynchronousHeartbeatFailure;
        await this.requireCutoverClaim(attemptToken);
        const summary = await this.repository.getSummary(PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION);

        if (summary.cutover.scan_phase === "reconciliation") {
          const claimedCount = await this.processReconciliationCycle(attemptToken, batchSize);
          if (asynchronousHeartbeatFailure) throw asynchronousHeartbeatFailure;
          await this.requireCutoverClaim(attemptToken);
          const afterCycle = await this.repository.getSummary(PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION);

          if (afterCycle.cutover.pending_count > 0 || afterCycle.cutover.started_count > 0) {
            if (claimedCount === 0) {
              return await this.failOwnedCutover(attemptToken, "legacy_storage_unavailable");
            }
            continue;
          }
          if (afterCycle.cutover.release_blocking_count > 0) {
            return await this.failOwnedCutover(attemptToken, firstFailureCode(afterCycle));
          }
          if (
            !(await this.repository.beginScanPhase({
              version: PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
              attemptToken,
              expectedPhase: "reconciliation",
              nextPhase: "discovery",
            }))
          ) {
            throw new LegacyProductDraftImageCutoverClaimLostError();
          }
          continue;
        }

        const keys = await this.repository.listPublicObjectKeys(
          summary.cutover.scan_cursor,
          batchSize,
        );
        if (keys.length > 0) {
          for (const destinationKey of keys) {
            const recorded = await this.repository.recordScanObject({
              version: PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
              cutoverAttemptToken: attemptToken,
              destinationKey,
            });
            if (recorded === "claim_lost") {
              throw new LegacyProductDraftImageCutoverClaimLostError();
            }
          }

          const nextCursor = keys[keys.length - 1]!;
          if (
            !(await this.repository.setScanProgress({
              version: PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
              attemptToken,
              scanPhase: summary.cutover.scan_phase,
              expectedCursor: summary.cutover.scan_cursor,
              nextCursor,
            }))
          ) {
            throw new LegacyProductDraftImageCutoverClaimLostError();
          }

          if (summary.cutover.scan_phase === "confirming") {
            const failed = await this.repository.getSummary(PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION);
            return await this.failOwnedCutover(attemptToken, firstFailureCode(failed));
          }
          continue;
        }

        const afterScan = await this.repository.getSummary(PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION);
        if (afterScan.cutover.release_blocking_count > 0) {
          return await this.failOwnedCutover(attemptToken, firstFailureCode(afterScan));
        }

        if (summary.cutover.scan_phase === "discovery") {
          if (
            !(await this.repository.beginScanPhase({
              version: PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
              attemptToken,
              expectedPhase: "discovery",
              nextPhase: "confirming",
            }))
          ) {
            throw new LegacyProductDraftImageCutoverClaimLostError();
          }
          continue;
        }

        if (summary.cutover.scan_phase !== "confirming" || summary.cutover.scan_cursor !== null) {
          throw new Error("ProductDraft image cutover scan state is inconsistent.");
        }
        if (
          !(await this.repository.completeCutover(
            PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
            attemptToken,
          ))
        ) {
          throw new LegacyProductDraftImageCutoverClaimLostError();
        }
        return {
          status: "completed",
          summary: await this.repository.getSummary(PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION),
        };
      }
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async processReconciliationCycle(
    cutoverAttemptToken: string,
    batchSize: number,
  ): Promise<number> {
    let reservations = 0;
    let claimedCount = 0;
    const failures: unknown[] = [];

    const runSlot = async () => {
      while (true) {
        const reservation = reservations;
        reservations += 1;
        if (reservation >= batchSize) return;

        const item = await this.repository.claimNextReconciliation({
          version: PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
          cutoverAttemptToken,
          claimTimeoutSeconds: PRODUCT_DRAFT_IMAGE_RECONCILIATION_CLAIM_TIMEOUT_SECONDS,
        });
        if (!item) return;
        claimedCount += 1;
        try {
          await this.processClaimedReconciliation(cutoverAttemptToken, item);
        } catch (error) {
          failures.push(error);
          return;
        }
      }
    };

    const slotCount = Math.min(PRODUCT_DRAFT_IMAGE_RECONCILIATION_CONCURRENCY, batchSize);
    await Promise.all(Array.from({ length: slotCount }, () => runSlot()));
    if (failures.length > 0) throw failures[0];
    return claimedCount;
  }

  private async processClaimedReconciliation(
    cutoverAttemptToken: string,
    item: LegacyProductDraftImageReconciliationWorkItem,
  ): Promise<void> {
    const controller = new AbortController();
    let deadlineReached = false;
    const deadline = setTimeout(() => {
      deadlineReached = true;
      controller.abort();
    }, PRODUCT_DRAFT_IMAGE_RECONCILIATION_DEADLINE_MS);

    let terminal: TerminalReconciliation;
    try {
      terminal = await this.reconcileObject(cutoverAttemptToken, item, controller.signal);
      if (deadlineReached) terminal = retryableStorageFailure();
    } catch (error) {
      if (error instanceof LegacyProductDraftImageCutoverClaimLostError) throw error;
      terminal = deadlineReached ? retryableStorageFailure() : mapUnexpectedFailure(error);
    } finally {
      clearTimeout(deadline);
    }

    await this.requireReconciliationClaim(cutoverAttemptToken, item);
    if (
      !(await this.repository.finalizeReconciliation({
        version: PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
        cutoverAttemptToken,
        destinationKey: item.destinationKey,
        reconciliationAttemptToken: item.attemptToken,
        ...terminal,
      }))
    ) {
      throw new LegacyProductDraftImageCutoverClaimLostError();
    }
  }

  private async reconcileObject(
    cutoverAttemptToken: string,
    item: LegacyProductDraftImageReconciliationWorkItem,
    signal: AbortSignal,
  ): Promise<TerminalReconciliation> {
    await this.requireReconciliationClaim(cutoverAttemptToken, item);
    const publicInfo = await this.storage.getInfo(
      PRODUCT_IMAGE_BUCKET,
      item.destinationKey,
      signal,
    );

    if (!item.productDraftImageId) {
      return publicInfo
        ? failure("legacy_destination_unowned", "unresolved", false, true, false)
        : completedAbsent(false);
    }

    if (!publicInfo) {
      if (item.imageStatus === "pending" || item.imageStatus === "failed") {
        return completedAbsent(true);
      }
      if (item.imageStatus !== "available") {
        return failure("legacy_object_unverifiable", "absent", false, false, true);
      }

      const expected = expectedObject(item);
      if (!expected) {
        return failure("legacy_object_unverifiable", "absent", false, false, true);
      }
      const privateInfo = await this.storage.getInfo(
        PRODUCT_DRAFT_IMAGE_BUCKET,
        item.destinationKey,
        signal,
      );
      if (!privateInfo) {
        return failure("legacy_source_missing", "absent", false, false, true);
      }
      if (!destinationObjectMatches(privateInfo, expected)) {
        return failure("legacy_private_object_conflict", "absent", false, false, true);
      }
      return completedAbsent(true);
    }

    const expected = expectedObject(item);
    if (!expected) {
      return failure("legacy_object_unverifiable", "unresolved", false, true, false);
    }
    if (!destinationObjectMatches(publicInfo, expected)) {
      return failure("legacy_source_conflict", "unresolved", false, true, false);
    }

    let privateInfo = await this.storage.getInfo(
      PRODUCT_DRAFT_IMAGE_BUCKET,
      item.destinationKey,
      signal,
    );
    if (!privateInfo) {
      const source = await this.storage.read(PRODUCT_IMAGE_BUCKET, item.destinationKey, signal);
      if (
        !source ||
        source.contentType !== "image/jpeg" ||
        source.bytes.byteLength !== expected.sizeBytes
      ) {
        return failure("legacy_source_conflict", "unresolved", false, true, false);
      }
      await this.requireReconciliationClaim(cutoverAttemptToken, item);
      await this.storage.createOnly({
        storageBucket: PRODUCT_DRAFT_IMAGE_BUCKET,
        destinationKey: item.destinationKey,
        bytes: source.bytes,
        contentType: "image/jpeg",
        metadata: expected.metadata,
        signal,
      });
      privateInfo = await this.storage.getInfo(
        PRODUCT_DRAFT_IMAGE_BUCKET,
        item.destinationKey,
        signal,
      );
    }

    if (!privateInfo || !destinationObjectMatches(privateInfo, expected)) {
      return failure("legacy_private_object_conflict", "unresolved", false, true, false);
    }

    await this.requireReconciliationClaim(cutoverAttemptToken, item);
    try {
      await this.storage.delete(PRODUCT_IMAGE_BUCKET, item.destinationKey, signal);
      const remainingPublic = await this.storage.getInfo(
        PRODUCT_IMAGE_BUCKET,
        item.destinationKey,
        signal,
      );
      if (remainingPublic) {
        return failure("legacy_public_delete_failed", "unresolved", true, true, false);
      }
    } catch (error) {
      if (error instanceof LegacyProductDraftImageCutoverClaimLostError) throw error;
      return failure("legacy_public_delete_failed", "unresolved", true, true, false);
    }

    return completedDeleted;
  }

  private async requireCutoverClaim(attemptToken: string): Promise<void> {
    if (!(await this.repository.heartbeat(PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION, attemptToken))) {
      throw new LegacyProductDraftImageCutoverClaimLostError();
    }
  }

  private async requireReconciliationClaim(
    cutoverAttemptToken: string,
    item: LegacyProductDraftImageReconciliationWorkItem,
  ): Promise<void> {
    if (
      !(await this.repository.verifyReconciliationClaim({
        version: PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
        cutoverAttemptToken,
        destinationKey: item.destinationKey,
        reconciliationAttemptToken: item.attemptToken,
      }))
    ) {
      throw new LegacyProductDraftImageCutoverClaimLostError();
    }
  }

  private async failOwnedCutover(
    attemptToken: string,
    errorCode: LegacyProductDraftImageCutoverErrorCode,
  ): Promise<ProductDraftImageCutoverRunResult> {
    if (
      !(await this.repository.failCutover(
        PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION,
        attemptToken,
        errorCode,
      ))
    ) {
      throw new LegacyProductDraftImageCutoverClaimLostError();
    }
    return {
      status: "failed",
      errorCode,
      summary: await this.repository.getSummary(PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION),
    };
  }
}

function expectedObject(item: LegacyProductDraftImageReconciliationWorkItem): {
  contentType: "image/jpeg";
  sizeBytes: number;
  metadata: ClassifierImageObjectMetadata;
} | null {
  if (
    !item.classifierOrganizationId ||
    !item.classifierBatchId ||
    !item.classifierGroupId ||
    !item.classifierImageId ||
    !item.sourceContentLength ||
    item.sourceContentLength <= 0
  ) {
    return null;
  }
  return {
    contentType: "image/jpeg",
    sizeBytes: item.sourceContentLength,
    metadata: buildDestinationMetadata({
      classifierOrganizationId: item.classifierOrganizationId,
      classifierBatchId: item.classifierBatchId,
      classifierGroupId: item.classifierGroupId,
      classifierImageId: item.classifierImageId,
      sourceContentLength: item.sourceContentLength,
    }),
  };
}

function failure(
  errorCode: LegacyProductDraftImageCutoverErrorCode,
  publicObjectState: ProductDraftImagePublicObjectState,
  retryable: boolean,
  releaseBlocking: boolean,
  setPrivateBucket: boolean,
): TerminalReconciliation {
  return {
    status: "failed",
    publicObjectState,
    errorCode,
    retryable,
    releaseBlocking,
    setPrivateBucket,
  };
}

function retryableStorageFailure(): TerminalReconciliation {
  return failure("legacy_storage_unavailable", "unchecked", true, true, false);
}

function mapUnexpectedFailure(error: unknown): TerminalReconciliation {
  if (error instanceof ClassifierImportError && error.code === "destination_storage_unavailable") {
    return retryableStorageFailure();
  }
  return failure("legacy_object_unverifiable", "unchecked", false, true, false);
}

function firstFailureCode(
  summary: ProductDraftImageCutoverSummary,
): LegacyProductDraftImageCutoverErrorCode {
  const first = Object.keys(summary.failuresByCode).sort()[0];
  return isLegacyErrorCode(first) ? first : "legacy_object_unverifiable";
}

function isLegacyErrorCode(
  value: string | undefined,
): value is LegacyProductDraftImageCutoverErrorCode {
  return (
    value === "legacy_source_missing" ||
    value === "legacy_source_conflict" ||
    value === "legacy_private_object_conflict" ||
    value === "legacy_object_unverifiable" ||
    value === "legacy_destination_unowned" ||
    value === "legacy_storage_unavailable" ||
    value === "legacy_public_delete_failed" ||
    value === "legacy_cutover_claim_lost"
  );
}

export function assertBatchSize(batchSize: number): void {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("batchSize must be an integer from 1 through 100.");
  }
}
