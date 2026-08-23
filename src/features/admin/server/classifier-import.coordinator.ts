import type { ClassifierImportConfig } from "./classifier-import.config";
import type {
  ClassifierImportDispatcher,
  ClassifierImportDispatchResult,
} from "./classifier-import.dispatcher";
import type { ClassifierImportRepository } from "./classifier-import.repository";
import type {
  ClassifierImportGroupOutcome,
  ClassifierImportRun,
  ClassifierImportStatusSnapshot,
  GroupImagePreparationService,
} from "./classifier-import.types";
import { ClassifierImportApiError } from "./classifier-import.types";

export type ClassifierImportActionResult = {
  httpStatus: 200 | 202;
  body: ClassifierImportStatusSnapshot;
};

export class ClassifierImportCoordinator {
  constructor(
    private readonly repository: ClassifierImportRepository,
    private readonly imagePreparation: GroupImagePreparationService,
    private readonly config: ClassifierImportConfig,
    private readonly dispatcher: ClassifierImportDispatcher,
    private readonly now: () => number = Date.now,
  ) {}

  async getStatus(importId: string): Promise<ClassifierImportStatusSnapshot> {
    const run = await this.requireRun(importId);
    const [groups, imageState, destinationSellerName] = await Promise.all([
      this.repository.listGroupOutcomes(importId),
      this.imagePreparation.getImageImportActionState(importId),
      this.repository.getSellerName(run.seller_id),
    ]);

    const terminalFailure =
      (run.status === "failed" || run.status === "completed_with_errors") &&
      run.attempt_token === null;
    const hasRetryableGroupFailure = groups.some(
      (group) => group.status === "failed" && group.retryable,
    );
    const hasGroupFailure = groups.some((group) => group.status === "failed");

    return {
      importId: run.id,
      classifierBatchId: run.classifier_batch_id,
      destinationSeller: {
        id: run.seller_id,
        name: destinationSellerName,
      },
      status: run.status,
      operationKind: run.operation_kind,
      errorCode: run.error_code,
      pendingGroupCount: countGroups(groups, "pending"),
      processingGroupCount: countGroups(groups, "processing"),
      completeGroupCount: countGroups(groups, "complete"),
      failedGroupCount: countGroups(groups, "failed"),
      actions: {
        canDispatch: this.canDispatch(run),
        canRetryTemporary:
          terminalFailure &&
          ((run.status === "failed" && run.retryable) ||
            hasRetryableGroupFailure ||
            imageState.hasRetryableFailures),
        canRetryAll:
          terminalFailure &&
          (run.status === "failed" || hasGroupFailure || imageState.hasAnyFailures),
        canReconcile:
          run.status === "completed" && run.attempt_token === null && imageState.hasPromotedImages,
      },
      groups: groups.map((group) => ({
        classifierGroupId: group.classifier_group_id,
        productDraftId: group.product_draft_id,
        status: group.status,
        errorCode: group.error_code,
      })),
    };
  }

  async retry(
    importId: string,
    includeNonRetryable: boolean,
  ): Promise<ClassifierImportActionResult> {
    const result = await this.repository.retryImport(importId, includeNonRetryable);
    if (result === "not_found") {
      throw new ClassifierImportApiError(
        404,
        "classifier_import_not_found",
        "Classifier import was not found.",
      );
    }
    if (result === "not_allowed") {
      throw new ClassifierImportApiError(
        409,
        "classifier_import_action_not_allowed",
        "Retry is not allowed for the current classifier import state.",
      );
    }
    if (result === "requeued") await this.acceptDispatch(importId);

    return {
      httpStatus: result === "requeued" ? 202 : 200,
      body: await this.getStatus(importId),
    };
  }

  async reconcile(importId: string): Promise<ClassifierImportActionResult> {
    const result = await this.repository.reconcileImport(importId);
    if (result === "not_found") {
      throw new ClassifierImportApiError(
        404,
        "classifier_import_not_found",
        "Classifier import was not found.",
      );
    }
    if (result === "not_allowed") {
      throw new ClassifierImportApiError(
        409,
        "classifier_import_action_not_allowed",
        "Reconciliation is not allowed for the current classifier import state.",
      );
    }
    await this.acceptDispatch(importId);

    return {
      httpStatus: 202,
      body: await this.getStatus(importId),
    };
  }

  async dispatch(importId: string): Promise<ClassifierImportActionResult> {
    const run = await this.requireRun(importId);
    if (!this.canDispatch(run)) {
      return {
        httpStatus: 200,
        body: await this.getStatus(importId),
      };
    }

    await this.acceptDispatch(importId);
    return {
      httpStatus: 202,
      body: await this.getStatus(importId),
    };
  }

  private async acceptDispatch(importId: string): Promise<ClassifierImportDispatchResult> {
    try {
      return await this.dispatcher.dispatch(importId);
    } catch {
      throw new ClassifierImportApiError(
        503,
        "classifier_import_dispatch_unavailable",
        "Classifier import processing could not be started.",
        { importId },
      );
    }
  }

  private canDispatch(run: ClassifierImportRun): boolean {
    if (run.status === "pending") return true;
    if (run.status !== "running" || !run.last_heartbeat_at) return false;
    const heartbeat = Date.parse(run.last_heartbeat_at);
    return (
      Number.isFinite(heartbeat) &&
      heartbeat + this.config.importRunLeaseTimeoutSeconds * 1000 < this.now()
    );
  }

  private async requireRun(importId: string): Promise<ClassifierImportRun> {
    const run = await this.repository.getRun(importId);
    if (!run) {
      throw new ClassifierImportApiError(
        404,
        "classifier_import_not_found",
        "Classifier import was not found.",
      );
    }
    return run;
  }
}

function countGroups(
  groups: ClassifierImportGroupOutcome[],
  status: ClassifierImportGroupOutcome["status"],
): number {
  return groups.filter((group) => group.status === status).length;
}
