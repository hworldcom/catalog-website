import type { ClassifierImportConfig } from "./classifier-import.config";
import type { ClassifierImportRepository } from "./classifier-import.repository";
import type {
  ApprovedGroup,
  ApprovedGroupsSnapshot,
  ClassifierImportRun,
  GroupImagePreparationResult,
  GroupImagePreparationService,
} from "./classifier-import.types";
import { ClassifierImportClaimLostError, ClassifierImportError } from "./classifier-import.types";

export interface ApprovedGroupsReader {
  getApprovedGroups(batchId: string): Promise<ApprovedGroupsSnapshot>;
}

export type ClassifierImportWorkerResult =
  | { status: "idle" }
  | (ClassifierImportWorkerResultMetadata & { status: "completed" })
  | (ClassifierImportWorkerResultMetadata & { status: "completed_with_errors" })
  | (ClassifierImportWorkerResultMetadata & { status: "failed"; errorCode: string })
  | (ClassifierImportWorkerResultMetadata & { status: "claim_lost" });

type ClassifierImportWorkerResultMetadata = {
  importId: string;
  operationKind: ClassifierImportRun["operation_kind"];
  attemptCount: number;
};

class ClaimLostError extends Error {}

export class ClassifierImportWorker {
  constructor(
    private readonly repository: ClassifierImportRepository,
    private readonly approvedGroups: ApprovedGroupsReader,
    private readonly imagePreparation: GroupImagePreparationService,
    private readonly config: ClassifierImportConfig,
  ) {}

  async runNext(): Promise<ClassifierImportWorkerResult> {
    const run = await this.repository.claimNextRun(this.config.importRunLeaseTimeoutSeconds);
    return await this.executeClaimed(run);
  }

  async run(importId: string): Promise<ClassifierImportWorkerResult> {
    const run = await this.repository.claimRun(importId, this.config.importRunLeaseTimeoutSeconds);
    return await this.executeClaimed(run);
  }

  private async executeClaimed(
    run: ClassifierImportRun | null,
  ): Promise<ClassifierImportWorkerResult> {
    if (!run) return { status: "idle" };
    const attemptToken = run.attempt_token;
    if (!attemptToken) {
      throw new Error("Claimed classifier import run has no attempt token.");
    }

    try {
      await this.requireHeartbeat(run.id, attemptToken);
      const snapshot = await this.approvedGroups.getApprovedGroups(run.classifier_batch_id);
      await this.requireHeartbeat(run.id, attemptToken);

      if (snapshot.organizationId !== this.config.classifierOrganizationId) {
        return await this.failTopLevel(
          run,
          attemptToken,
          "classifier_organization_mismatch",
          false,
        );
      }

      if (!(await this.repository.isSellerEligible(run.seller_id))) {
        return await this.failTopLevel(
          run,
          attemptToken,
          "classifier_import_destination_seller_not_eligible",
          false,
        );
      }

      if (
        !(await this.repository.setPipelineVersion(run.id, attemptToken, snapshot.pipelineVersion))
      ) {
        throw new ClaimLostError();
      }

      if (run.operation_kind === "reconcile") {
        return await this.runReconciliation(run, attemptToken, snapshot);
      }
      return await this.runImport(run, attemptToken, snapshot);
    } catch (error) {
      if (error instanceof ClaimLostError) {
        return this.result(run, { status: "claim_lost" });
      }
      if (error instanceof ClassifierImportClaimLostError) {
        return this.result(run, { status: "claim_lost" });
      }
      if (error instanceof ClassifierImportError) {
        return await this.failTopLevel(run, attemptToken, error.code, error.retryable);
      }
      throw error;
    }
  }

  private async runImport(
    run: ClassifierImportRun,
    attemptToken: string,
    snapshot: ApprovedGroupsSnapshot,
  ): Promise<ClassifierImportWorkerResult> {
    const existingOutcomes = new Map(
      (await this.repository.listGroupOutcomes(run.id)).map((group) => [
        group.classifier_group_id,
        group,
      ]),
    );

    for (const group of snapshot.groups) {
      const existing = existingOutcomes.get(group.groupId);
      if (existing?.status === "complete" || existing?.status === "failed") {
        continue;
      }
      await this.processGroup(run, attemptToken, group);
      await this.requireHeartbeat(run.id, attemptToken);
    }

    return await this.finalizeFromGroupOutcomes(run, attemptToken);
  }

  private async runReconciliation(
    run: ClassifierImportRun,
    attemptToken: string,
    snapshot: ApprovedGroupsSnapshot,
  ): Promise<ClassifierImportWorkerResult> {
    const result = await this.imagePreparation.reconcilePromotedImages(run, attemptToken);
    await this.requireHeartbeat(run.id, attemptToken);

    if (result.missingGroupIds.size === 0 && result.conflictingGroupIds.size === 0) {
      if (
        !(await this.repository.finalizeRun(run.id, attemptToken, {
          status: "completed",
        }))
      ) {
        throw new ClaimLostError();
      }
      return this.result(run, { status: "completed" });
    }

    const groupsById = new Map(snapshot.groups.map((group) => [group.groupId, group]));
    for (const groupId of result.missingGroupIds) {
      const group = groupsById.get(groupId);
      if (!group) {
        throw new ClassifierImportError("approved_groups_response_invalid", false);
      }
      await this.processGroup(run, attemptToken, group);
      await this.requireHeartbeat(run.id, attemptToken);
    }

    for (const groupId of result.conflictingGroupIds) {
      if (
        !(await this.repository.setGroupResult(run.id, attemptToken, groupId, {
          status: "failed",
          errorCode: "destination_object_conflict",
          retryable: false,
        }))
      ) {
        throw new ClaimLostError();
      }
    }

    return await this.finalizeFromGroupOutcomes(run, attemptToken);
  }

  private async processGroup(
    run: ClassifierImportRun,
    attemptToken: string,
    group: ApprovedGroup,
  ): Promise<void> {
    const preparation = await this.repository.prepareGroup(run.id, attemptToken, group);
    if (preparation.result === "claim_lost") throw new ClaimLostError();
    if (preparation.result !== "prepared") return;

    await this.requireHeartbeat(run.id, attemptToken);
    let result: GroupImagePreparationResult;
    try {
      result = await this.imagePreparation.prepareGroupImages(run, attemptToken, group);
    } catch (error) {
      if (error instanceof ClassifierImportClaimLostError) {
        throw new ClaimLostError();
      }
      if (error instanceof ClassifierImportError) {
        result = {
          status: "failed",
          errorCode: error.code,
          retryable: error.retryable,
        };
      } else {
        throw error;
      }
    }

    if (
      !(await this.repository.setGroupResult(
        run.id,
        attemptToken,
        group.groupId,
        result.status === "complete"
          ? { status: "complete" }
          : {
              status: "failed",
              errorCode: result.errorCode,
              retryable: result.retryable,
            },
      ))
    ) {
      throw new ClaimLostError();
    }
  }

  private async finalizeFromGroupOutcomes(
    run: ClassifierImportRun,
    attemptToken: string,
  ): Promise<ClassifierImportWorkerResult> {
    let outcomes = await this.repository.listGroupOutcomes(run.id);
    const unfinished = outcomes.filter(
      (outcome) => outcome.status === "pending" || outcome.status === "processing",
    );
    for (const outcome of unfinished) {
      if (
        !(await this.repository.setGroupResult(run.id, attemptToken, outcome.classifier_group_id, {
          status: "failed",
          errorCode: "image_preparation_incomplete",
          retryable: true,
        }))
      ) {
        throw new ClaimLostError();
      }
    }
    if (unfinished.length > 0) {
      outcomes = await this.repository.listGroupOutcomes(run.id);
    }

    const hasFailures = outcomes.some((outcome) => outcome.status === "failed");
    const terminalStatus = hasFailures ? "completed_with_errors" : "completed";
    if (
      !(await this.repository.finalizeRun(run.id, attemptToken, {
        status: terminalStatus,
      }))
    ) {
      throw new ClaimLostError();
    }
    return this.result(run, { status: terminalStatus });
  }

  private async failTopLevel(
    run: ClassifierImportRun,
    attemptToken: string,
    errorCode: string,
    retryable: boolean,
  ): Promise<ClassifierImportWorkerResult> {
    if (
      !(await this.repository.finalizeRun(run.id, attemptToken, {
        status: "failed",
        errorCode,
        retryable,
      }))
    ) {
      return this.result(run, { status: "claim_lost" });
    }
    return this.result(run, { status: "failed", errorCode });
  }

  private result<T extends { status: Exclude<ClassifierImportWorkerResult["status"], "idle"> }>(
    run: ClassifierImportRun,
    result: T,
  ): T & ClassifierImportWorkerResultMetadata {
    return {
      ...result,
      importId: run.id,
      operationKind: run.operation_kind,
      attemptCount: run.attempt_count,
    };
  }

  private async requireHeartbeat(importId: string, attemptToken: string): Promise<void> {
    if (!(await this.repository.heartbeat(importId, attemptToken))) {
      throw new ClaimLostError();
    }
  }
}
