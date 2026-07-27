import type { ClassifierImportConfig } from "./classifier-import.config";
import type {
  ClassifierImagePromotionRepository,
  PromotionWorkItem,
} from "./classifier-image-promotion.repository";
import type {
  NormalizedClassifierImage,
  NormalizedClassifierImageReader,
} from "./classifier-normalized-image.service";
import type {
  ApprovedGroup,
  ClassifierImportRun,
  GroupImagePreparationResult,
  GroupImagePreparationService,
  ImageImportActionState,
  ReconciliationResult,
} from "./classifier-import.types";
import { ClassifierImportClaimLostError, ClassifierImportError } from "./classifier-import.types";
import {
  buildDestinationMetadata,
  type ClassifierImageObjectMetadata,
  type DestinationImageStorage,
  destinationObjectMatches,
} from "./destination-image-storage";

export class ClassifierImagePromotionService implements GroupImagePreparationService {
  constructor(
    private readonly repository: ClassifierImagePromotionRepository,
    private readonly normalizedImages: NormalizedClassifierImageReader,
    private readonly destinationStorage: DestinationImageStorage,
    private readonly config: ClassifierImportConfig,
  ) {}

  getImageImportActionState(importRunId: string): Promise<ImageImportActionState> {
    return this.repository.getActionState(importRunId);
  }

  async prepareGroupImages(
    run: ClassifierImportRun,
    runAttemptToken: string,
    group: ApprovedGroup,
  ): Promise<GroupImagePreparationResult> {
    const prepared = await this.repository.prepareGroup(run.id, runAttemptToken, group);
    if (prepared.result === "claim_lost") throw new ClassifierImportClaimLostError();
    if (prepared.result !== "prepared") {
      return {
        status: "failed",
        errorCode:
          prepared.result === "source_membership_conflict"
            ? "source_membership_conflict"
            : "product_draft_group_not_prepared",
        retryable: false,
      };
    }

    const promotions = await this.repository.listGroupPromotions(prepared.productDraftId);
    for (const promotion of promotions) {
      if (promotion.status === "promoted" || promotion.status === "failed") continue;

      const claimed = await this.repository.claimPromotion({
        importId: run.id,
        runAttemptToken,
        promotionId: promotion.id,
        claimTimeoutSeconds: this.config.imagePromotionClaimTimeoutSeconds,
      });
      if (!claimed) continue;
      await this.processClaimedPromotion(run, runAttemptToken, claimed);
    }

    const terminalPromotions = await this.repository.listGroupPromotions(prepared.productDraftId);
    if (
      terminalPromotions.some(
        (promotion) => promotion.status === "pending" || promotion.status === "started",
      )
    ) {
      throw new Error("Classifier image preparation left unfinished promotions.");
    }

    const failures = terminalPromotions.filter((promotion) => promotion.status === "failed");
    if (failures.length > 0) {
      const firstFailure = failures[0]!;
      return {
        status: "failed",
        errorCode: firstFailure.error_code ?? "image_promotion_failed",
        retryable: failures.some((promotion) => promotion.retryable),
      };
    }
    if (terminalPromotions.length === 0) {
      return {
        status: "failed",
        errorCode: "source_membership_conflict",
        retryable: false,
      };
    }
    return { status: "complete" };
  }

  async reconcilePromotedImages(
    run: ClassifierImportRun,
    runAttemptToken: string,
  ): Promise<ReconciliationResult> {
    const promotedImages = await this.repository.listPromotedRunImages({
      classifierOrganizationId: run.classifier_organization_id,
      classifierBatchId: run.classifier_batch_id,
    });
    const missingGroupIds = new Set<string>();
    const conflictingGroupIds = new Set<string>();

    for (const promotion of promotedImages) {
      await this.requireRunHeartbeat(run.id, runAttemptToken);
      const info = await this.destinationStorage.getInfo(
        promotion.storageBucket,
        promotion.destinationKey,
      );

      if (!info) {
        if (
          !(await this.repository.resetMissing({
            importId: run.id,
            runAttemptToken,
            promotionId: promotion.id,
          }))
        ) {
          throw new ClassifierImportClaimLostError();
        }
        missingGroupIds.add(promotion.classifier_group_id);
        continue;
      }

      const expected = expectedDestination(promotion);
      if (!expected || !destinationObjectMatches(info, expected)) {
        if (
          !(await this.repository.markConflict({
            importId: run.id,
            runAttemptToken,
            promotionId: promotion.id,
          }))
        ) {
          throw new ClassifierImportClaimLostError();
        }
        conflictingGroupIds.add(promotion.classifier_group_id);
      }
    }

    await this.requireRunHeartbeat(run.id, runAttemptToken);
    return { missingGroupIds, conflictingGroupIds };
  }

  private async processClaimedPromotion(
    run: ClassifierImportRun,
    runAttemptToken: string,
    promotion: PromotionWorkItem,
  ): Promise<void> {
    const promotionAttemptToken = promotion.attempt_token;
    if (!promotionAttemptToken) throw new ClassifierImportClaimLostError();

    try {
      await this.requirePromotionClaim(
        run.id,
        runAttemptToken,
        promotion.id,
        promotionAttemptToken,
      );
      const source = await this.normalizedImages.readNormalizedImage({
        batchId: promotion.classifier_batch_id,
        groupId: promotion.classifier_group_id,
        imageId: promotion.classifier_image_id,
      });

      if (
        !(await this.repository.setSourceContentLength({
          importId: run.id,
          runAttemptToken,
          promotionId: promotion.id,
          promotionAttemptToken,
          sourceContentLength: source.contentLength,
        }))
      ) {
        throw new ClassifierImportClaimLostError();
      }

      const metadata = buildDestinationMetadata({
        classifierOrganizationId: promotion.classifier_organization_id,
        classifierBatchId: promotion.classifier_batch_id,
        classifierGroupId: promotion.classifier_group_id,
        classifierImageId: promotion.classifier_image_id,
        sourceContentLength: source.contentLength,
      });

      await this.requirePromotionClaim(
        run.id,
        runAttemptToken,
        promotion.id,
        promotionAttemptToken,
      );
      let destinationInfo = await this.destinationStorage.getInfo(
        promotion.storageBucket,
        promotion.destinationKey,
      );

      if (!destinationInfo) {
        await this.requirePromotionClaim(
          run.id,
          runAttemptToken,
          promotion.id,
          promotionAttemptToken,
        );
        await this.destinationStorage.createOnly({
          storageBucket: promotion.storageBucket,
          destinationKey: promotion.destinationKey,
          bytes: source.bytes,
          contentType: source.contentType,
          metadata,
        });
        await this.requirePromotionClaim(
          run.id,
          runAttemptToken,
          promotion.id,
          promotionAttemptToken,
        );
        destinationInfo = await this.destinationStorage.getInfo(
          promotion.storageBucket,
          promotion.destinationKey,
        );
        if (!destinationInfo) {
          throw new ClassifierImportError("destination_storage_unavailable", true);
        }
      }

      if (
        !destinationObjectMatches(destinationInfo, {
          contentType: source.contentType,
          sizeBytes: source.contentLength,
          metadata,
        })
      ) {
        throw new ClassifierImportError("destination_object_conflict", false);
      }

      await this.requirePromotionClaim(
        run.id,
        runAttemptToken,
        promotion.id,
        promotionAttemptToken,
      );
      if (
        !(await this.repository.finalizeSuccess({
          importId: run.id,
          runAttemptToken,
          promotionId: promotion.id,
          promotionAttemptToken,
          destinationSizeBytes: source.contentLength,
        }))
      ) {
        throw new ClassifierImportClaimLostError();
      }
    } catch (error) {
      if (error instanceof ClassifierImportClaimLostError) throw error;
      if (!(error instanceof ClassifierImportError)) throw error;

      await this.requirePromotionClaim(
        run.id,
        runAttemptToken,
        promotion.id,
        promotionAttemptToken,
      );
      if (
        !(await this.repository.finalizeFailure({
          importId: run.id,
          runAttemptToken,
          promotionId: promotion.id,
          promotionAttemptToken,
          errorCode: error.code,
          retryable: error.retryable,
        }))
      ) {
        throw new ClassifierImportClaimLostError();
      }
    }
  }

  private async requirePromotionClaim(
    importId: string,
    runAttemptToken: string,
    promotionId: string,
    promotionAttemptToken: string,
  ): Promise<void> {
    if (
      !(await this.repository.verifyClaim({
        importId,
        runAttemptToken,
        promotionId,
        promotionAttemptToken,
      }))
    ) {
      throw new ClassifierImportClaimLostError();
    }
  }

  private async requireRunHeartbeat(importId: string, runAttemptToken: string): Promise<void> {
    if (!(await this.repository.heartbeatRun(importId, runAttemptToken))) {
      throw new ClassifierImportClaimLostError();
    }
  }
}

function expectedDestination(promotion: PromotionWorkItem): {
  contentType: "image/jpeg";
  sizeBytes: number;
  metadata: ClassifierImageObjectMetadata;
} | null {
  if (!promotion.source_content_length) return null;
  return {
    contentType: "image/jpeg",
    sizeBytes: promotion.source_content_length,
    metadata: buildDestinationMetadata({
      classifierOrganizationId: promotion.classifier_organization_id,
      classifierBatchId: promotion.classifier_batch_id,
      classifierGroupId: promotion.classifier_group_id,
      classifierImageId: promotion.classifier_image_id,
      sourceContentLength: promotion.source_content_length,
    }),
  };
}
