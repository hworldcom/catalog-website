import type { ApprovedGroupsReader } from "@/features/admin/server/classifier-import.worker";
import type { ClassifierImportDispatcher } from "@/features/admin/server/classifier-import.dispatcher";
import type {
  ApprovedGroupsSnapshot,
  ClassifierImportGroupOutcome,
  ClassifierImportRun,
} from "@/features/admin/server/classifier-import.types";
import { ClassifierImportError } from "@/features/admin/server/classifier-import.types";

import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import type {
  SellerClassifierDraftImportSnapshot,
  SellerClassifierDraftImportStage,
} from "../seller-classifier-import.types";
import type {
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
} from "./seller-classifier-batch.repository";
import type { SellerClassifierImportRepository } from "./seller-classifier-import.repository";
import type { SellerClassifierReviewSnapshot } from "../seller-classifier-review.types";

export interface SellerClassifierBatchApprovalService {
  approveBatchForImport(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierReviewSnapshot>;
}

export class SellerClassifierImportService {
  constructor(
    private readonly workflows: SellerClassifierBatchRepository,
    private readonly imports: SellerClassifierImportRepository,
    private readonly review: SellerClassifierBatchApprovalService,
    private readonly approvedGroups: ApprovedGroupsReader,
    private readonly dispatcher: ClassifierImportDispatcher,
    private readonly classifierOrganizationId: string,
    private readonly importRunLeaseTimeoutSeconds: number,
    private readonly now: () => number = Date.now,
  ) {}

  async approveAndCreateDrafts(
    workflowId: string,
    sellerId: string,
    requestedByUserId: string,
  ): Promise<SellerClassifierDraftImportSnapshot> {
    const workflow = await this.requireWorkflow(workflowId, sellerId);
    const classifierBatchId = requireClassifierBatch(workflow);
    this.requireConfiguredOrganization(workflow);

    const existing = await this.imports.findBySource(
      workflow.classifierOrganizationId,
      classifierBatchId,
    );
    if (existing) {
      const run = await this.bindImport(workflow, requestedByUserId);
      await this.dispatchWhenPermitted(run);
      return await this.getStatus(workflowId, sellerId);
    }

    const review = await this.review.approveBatchForImport(workflowId, sellerId);
    if (review.groups.length === 0 || review.groups.some((group) => group.status !== "approved")) {
      throw groupsNotApproved();
    }

    const approved = await this.readApprovedGroups(classifierBatchId);
    if (
      approved.organizationId !== workflow.classifierOrganizationId ||
      approved.batchId !== classifierBatchId ||
      approved.groups.length === 0
    ) {
      throw classifierUnavailable();
    }

    const run = await this.bindImport(workflow, requestedByUserId);
    await this.dispatchWhenPermitted(run);
    return await this.getStatus(workflowId, sellerId);
  }

  async getStatus(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierDraftImportSnapshot> {
    const workflow = await this.requireWorkflow(workflowId, sellerId);
    this.requireConfiguredOrganization(workflow);
    const run = await this.imports.findOwned(workflowId, sellerId);

    if (!run) {
      if (workflow.lastKnownStage !== "approved") throw groupsNotApproved();
      return emptyApprovedSnapshot(workflow);
    }

    const [outcomes, actionState, productDrafts] = await Promise.all([
      this.imports.listGroupOutcomes(run.id),
      this.imports.getActionState(run.id),
      this.imports.listProductDrafts(run.id, sellerId),
    ]);

    return {
      workflowId: workflow.id,
      stage: requireImportStage(workflow.lastKnownStage),
      importStatus: run.status,
      continuationAllowed: canDispatch(run, this.importRunLeaseTimeoutSeconds, this.now()),
      retryAllowed: actionState.canRetryTemporary,
      errorCode: workflow.errorCode,
      pendingGroupCount: countGroups(outcomes, "pending"),
      processingGroupCount: countGroups(outcomes, "processing"),
      completeGroupCount: countGroups(outcomes, "complete"),
      failedGroupCount: countGroups(outcomes, "failed"),
      productDrafts,
    };
  }

  async retry(workflowId: string, sellerId: string): Promise<SellerClassifierDraftImportSnapshot> {
    const workflow = await this.requireWorkflow(workflowId, sellerId);
    this.requireConfiguredOrganization(workflow);
    const run = await this.imports.findOwned(workflowId, sellerId);
    if (!run) throw retryNotAllowed();

    const current = await this.getStatus(workflowId, sellerId);
    if (!current.retryAllowed) throw retryNotAllowed();

    const result = await this.imports.retry(run.id);
    if (result === "not_found") throw workflowNotFound();
    if (result !== "requeued") throw retryNotAllowed();

    const requeued = await this.imports.findOwned(workflowId, sellerId);
    if (!requeued || requeued.id !== run.id) throw importUnavailable();
    await this.dispatchWhenPermitted(requeued);
    return await this.getStatus(workflowId, sellerId);
  }

  private async bindImport(
    workflow: SellerClassifierBatchRecord,
    requestedByUserId: string,
  ): Promise<ClassifierImportRun> {
    const classifierBatchId = requireClassifierBatch(workflow);
    const result = await this.imports.createOrGetOwned({
      workflowId: workflow.id,
      sellerId: workflow.sellerId,
      classifierOrganizationId: workflow.classifierOrganizationId,
      classifierBatchId,
      requestedByUserId,
    });

    if (result.operation === "ownership_conflict") throw ownershipConflict();
    if (result.operation === "not_found") throw workflowNotFound();
    if (result.operation === "stale") throw groupsNotApproved();
    if (!result.run) throw importUnavailable();
    return result.run;
  }

  private async dispatchWhenPermitted(run: ClassifierImportRun): Promise<void> {
    if (!canDispatch(run, this.importRunLeaseTimeoutSeconds, this.now())) return;
    try {
      await this.dispatcher.dispatch(run.id);
    } catch {
      throw classifierUnavailable();
    }
  }

  private async readApprovedGroups(batchId: string): Promise<ApprovedGroupsSnapshot> {
    try {
      return await this.approvedGroups.getApprovedGroups(batchId);
    } catch (error) {
      if (error instanceof ClassifierImportError) throw classifierUnavailable();
      throw error;
    }
  }

  private async requireWorkflow(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierBatchRecord> {
    const workflow = await this.workflows.findOwned(workflowId, sellerId);
    if (!workflow) throw workflowNotFound();
    if (workflow.provisioningStatus !== "ready" || !workflow.classifierBatchId) {
      throw groupsNotApproved();
    }
    return workflow;
  }

  private requireConfiguredOrganization(workflow: SellerClassifierBatchRecord): void {
    if (workflow.classifierOrganizationId !== this.classifierOrganizationId) {
      throw configurationInvalid();
    }
  }
}

function emptyApprovedSnapshot(
  workflow: SellerClassifierBatchRecord,
): SellerClassifierDraftImportSnapshot {
  return {
    workflowId: workflow.id,
    stage: "approved",
    importStatus: null,
    continuationAllowed: true,
    retryAllowed: false,
    errorCode: null,
    pendingGroupCount: 0,
    processingGroupCount: 0,
    completeGroupCount: 0,
    failedGroupCount: 0,
    productDrafts: [],
  };
}

function requireClassifierBatch(workflow: SellerClassifierBatchRecord): string {
  if (!workflow.classifierBatchId) throw groupsNotApproved();
  return workflow.classifierBatchId;
}

function requireImportStage(stage: string): SellerClassifierDraftImportStage {
  if (
    stage === "approved" ||
    stage === "importing" ||
    stage === "drafts_ready" ||
    stage === "failed"
  ) {
    return stage;
  }
  throw importUnavailable();
}

function canDispatch(run: ClassifierImportRun, leaseTimeoutSeconds: number, now: number): boolean {
  if (run.status === "pending") return true;
  if (run.status !== "running" || !run.last_heartbeat_at) return false;
  const heartbeat = Date.parse(run.last_heartbeat_at);
  return Number.isFinite(heartbeat) && heartbeat + leaseTimeoutSeconds * 1000 < now;
}

function countGroups(
  outcomes: ClassifierImportGroupOutcome[],
  status: ClassifierImportGroupOutcome["status"],
): number {
  return outcomes.filter((outcome) => outcome.status === status).length;
}

function workflowNotFound(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    404,
    "seller_classifier_batch_not_found",
    "The classifier workflow was not found.",
  );
}

function groupsNotApproved(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    409,
    "seller_classifier_groups_not_approved",
    "Approve every classifier group before creating product drafts.",
  );
}

function ownershipConflict(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    409,
    "seller_classifier_import_ownership_conflict",
    "The classifier batch is already assigned to another workflow.",
  );
}

function retryNotAllowed(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    409,
    "seller_classifier_import_retry_not_allowed",
    "The classifier import cannot be retried in its current state.",
  );
}

function configurationInvalid(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    500,
    "seller_classifier_configuration_invalid",
    "Seller classifier workflows are not configured.",
  );
}

function importUnavailable(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    500,
    "seller_classifier_import_unavailable",
    "The seller classifier import is temporarily unavailable.",
  );
}

function classifierUnavailable(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    503,
    "seller_classifier_unavailable",
    "The classifier is temporarily unavailable.",
  );
}
