import { SellerClassifierBatchError } from "@/features/seller-classifier/seller-classifier-batch.types";
import type { SellerClassifierDraftImportSnapshot } from "@/features/seller-classifier/seller-classifier-import.types";
import type { SellerClassifierImportService } from "@/features/seller-classifier/server/seller-classifier-import.service";
import type { SellerClassifierReviewService } from "@/features/seller-classifier/server/seller-classifier-review.service";

import {
  delegatedActionAuditUnavailable,
  delegatedClassifierUnavailable,
  delegatedImportRetryNotAllowed,
  delegatedImportUnavailable,
  delegatedReviewInvalid,
  delegatedReviewNotAllowed,
  delegatedReviewResourceNotFound,
  type DelegatedApproveBatchInput,
  type DelegatedApproveGroupInput,
  type DelegatedClassifierCategoriesContext,
  type DelegatedClassifierDraftImportContext,
  type DelegatedClassifierReviewContext,
  type DelegatedRetryImportInput,
} from "../delegated-classifier-review-import.types";
import {
  delegatedUploadWorkflowNotFound,
  type DelegatedUploadSeller,
} from "../delegated-classifier-upload.types";
import {
  DelegatedClassifierUploadRepositoryError,
  type DelegatedClassifierUploadRepository,
} from "./delegated-classifier-upload.repository";
import type { DelegatedAdministratorActionService } from "./delegated-administrator-action.service";
import {
  DelegatedAdministratorActionRepositoryError,
  type DelegatedAdministratorActionRepository,
} from "./delegated-administrator-action.repository";
import type {
  CreateSellerClassifierGroupInput,
  MergeSellerClassifierGroupsInput,
  MoveSellerClassifierImageInput,
  SelectSellerClassifierCategoryInput,
  SelectSellerClassifierCoverInput,
  SellerClassifierGroupImageInput,
  SellerClassifierReviewSnapshot,
  SetSellerClassifierDuplicateInput,
  SplitSellerClassifierGroupInput,
} from "@/features/seller-classifier/seller-classifier-review.types";
import type { SellerClassifierBatchRecord } from "@/features/seller-classifier/server/seller-classifier-batch.repository";

type ReviewService = Pick<
  SellerClassifierReviewService,
  | "getReview"
  | "listCategories"
  | "createGroup"
  | "mergeGroups"
  | "splitGroup"
  | "moveImage"
  | "setDuplicate"
  | "selectCover"
  | "selectCategory"
  | "rejectImage"
  | "restoreImage"
  | "approveGroup"
  | "getThumbnail"
>;

type ImportService = Pick<
  SellerClassifierImportService,
  "approveAndCreateDrafts" | "getStatus" | "retry"
>;

type DelegatedWorkflow = {
  seller: DelegatedUploadSeller;
  record: SellerClassifierBatchRecord;
};

export class DelegatedClassifierReviewImportService {
  constructor(
    private readonly workflows: DelegatedClassifierUploadRepository,
    private readonly review: ReviewService,
    private readonly imports: ImportService,
    private readonly actions: DelegatedAdministratorActionService,
    private readonly actionRepository: DelegatedAdministratorActionRepository,
  ) {}

  async getReview(workflowId: string): Promise<DelegatedClassifierReviewContext> {
    return this.withWorkflow(workflowId, async (workflow) =>
      this.reviewContext(
        workflow,
        await this.reviewOperation(() =>
          this.review.getReview(workflow.record.id, workflow.record.sellerId),
        ),
      ),
    );
  }

  async listCategories(workflowId: string): Promise<DelegatedClassifierCategoriesContext> {
    return this.withWorkflow(workflowId, async (workflow) => ({
      seller: workflow.seller,
      categories: await this.reviewOperation(() => this.review.listCategories()),
    }));
  }

  async createGroup(
    input: CreateSellerClassifierGroupInput,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.reviewMutation(input.workflowId, (sellerId) =>
      this.review.createGroup(sellerId, input),
    );
  }

  async mergeGroups(
    input: MergeSellerClassifierGroupsInput,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.reviewMutation(input.workflowId, (sellerId) =>
      this.review.mergeGroups(sellerId, input),
    );
  }

  async splitGroup(
    input: SplitSellerClassifierGroupInput,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.reviewMutation(input.workflowId, (sellerId) =>
      this.review.splitGroup(sellerId, input),
    );
  }

  async moveImage(
    input: MoveSellerClassifierImageInput,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.reviewMutation(input.workflowId, (sellerId) =>
      this.review.moveImage(sellerId, input),
    );
  }

  async setDuplicate(
    input: SetSellerClassifierDuplicateInput,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.reviewMutation(input.workflowId, (sellerId) =>
      this.review.setDuplicate(sellerId, input),
    );
  }

  async selectCover(
    input: SelectSellerClassifierCoverInput,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.reviewMutation(input.workflowId, (sellerId) =>
      this.review.selectCover(sellerId, input),
    );
  }

  async selectCategory(
    input: SelectSellerClassifierCategoryInput,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.reviewMutation(input.workflowId, (sellerId) =>
      this.review.selectCategory(sellerId, input),
    );
  }

  async rejectImage(
    input: SellerClassifierGroupImageInput,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.reviewMutation(input.workflowId, (sellerId) =>
      this.review.rejectImage(sellerId, input),
    );
  }

  async restoreImage(
    input: SellerClassifierGroupImageInput,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.reviewMutation(input.workflowId, (sellerId) =>
      this.review.restoreImage(sellerId, input),
    );
  }

  async getThumbnail(workflowId: string, imageId: string): Promise<Uint8Array> {
    return this.withWorkflow(workflowId, (workflow) =>
      this.reviewOperation(() =>
        this.review.getThumbnail(workflow.record.id, imageId, workflow.record.sellerId),
      ),
    );
  }

  async approveGroup(
    input: DelegatedApproveGroupInput,
    administratorUserId: string,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.withWorkflow(input.workflowId, (workflow) =>
      this.actions.run({
        requestId: input.requestId,
        workflowId: workflow.record.id,
        expectedSellerId: workflow.record.sellerId,
        administratorUserId,
        actionType: "approve_group",
        targetId: input.groupId,
        payload: {},
        readTerminal: async () => {
          const context = await this.readReviewContext(workflow);
          requireApprovedGroup(context.review, input.groupId);
          return context;
        },
        reconcile: async () => {
          const context = await this.readReviewContext(workflow);
          return requireGroup(context.review, input.groupId).status === "approved" ? context : null;
        },
        execute: async () =>
          this.reviewContext(
            workflow,
            await this.reviewOperation(() =>
              this.review.approveGroup(workflow.record.sellerId, {
                workflowId: workflow.record.id,
                groupId: input.groupId,
              }),
            ),
          ),
      }),
    );
  }

  async approveBatchAndCreateDrafts(
    input: DelegatedApproveBatchInput,
    administratorUserId: string,
  ): Promise<DelegatedClassifierDraftImportContext> {
    return this.withWorkflow(input.workflowId, (workflow) =>
      this.actions.run({
        requestId: input.requestId,
        workflowId: workflow.record.id,
        expectedSellerId: workflow.record.sellerId,
        administratorUserId,
        actionType: "approve_and_create_drafts",
        targetId: null,
        payload: {},
        readTerminal: async () =>
          this.requireStartedImport(workflow, await this.readImport(workflow)),
        reconcile: async () => {
          const review = await this.readReviewContext(workflow);
          requireAllGroupsApproved(review.review);
          if (review.review.stage !== "approved") return null;
          const current = await this.readImport(workflow);
          return current.draftImport.importStatus ? current : null;
        },
        execute: async () =>
          this.importContext(
            workflow,
            await this.importOperation(() =>
              this.imports.approveAndCreateDrafts(
                workflow.record.id,
                workflow.record.sellerId,
                administratorUserId,
              ),
            ),
          ),
      }),
    );
  }

  async getDraftImport(workflowId: string): Promise<DelegatedClassifierDraftImportContext> {
    return this.withWorkflow(workflowId, (workflow) => this.readImport(workflow));
  }

  async retryDraftImport(
    input: DelegatedRetryImportInput,
    administratorUserId: string,
  ): Promise<DelegatedClassifierDraftImportContext> {
    return this.withWorkflow(input.workflowId, async (workflow) => {
      const importRunId = await this.auditOperation(() =>
        this.actionRepository.findImportRunId(workflow.record.id, workflow.record.sellerId),
      );
      if (!importRunId) throw delegatedImportRetryNotAllowed();

      return this.actions.run({
        requestId: input.requestId,
        workflowId: workflow.record.id,
        expectedSellerId: workflow.record.sellerId,
        administratorUserId,
        actionType: "retry_draft_import",
        targetId: importRunId,
        payload: {},
        readTerminal: () => this.readImport(workflow),
        reconcile: async () => {
          const current = await this.readImport(workflow);
          if (current.draftImport.retryAllowed) return null;
          if (
            current.draftImport.importStatus === "pending" ||
            current.draftImport.importStatus === "running" ||
            current.draftImport.importStatus === "completed" ||
            current.draftImport.importStatus === "completed_with_errors"
          ) {
            return current;
          }
          throw delegatedImportRetryNotAllowed();
        },
        execute: async () =>
          this.importContext(
            workflow,
            await this.importOperation(() =>
              this.imports.retry(workflow.record.id, workflow.record.sellerId),
            ),
          ),
      });
    });
  }

  private async reviewMutation(
    workflowId: string,
    operation: (sellerId: string) => Promise<SellerClassifierReviewSnapshot>,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.withWorkflow(workflowId, async (workflow) =>
      this.reviewContext(
        workflow,
        await this.reviewOperation(() => operation(workflow.record.sellerId)),
      ),
    );
  }

  private async readReviewContext(
    workflow: DelegatedWorkflow,
  ): Promise<DelegatedClassifierReviewContext> {
    return this.reviewContext(
      workflow,
      await this.reviewOperation(() =>
        this.review.getReview(workflow.record.id, workflow.record.sellerId),
      ),
    );
  }

  private async readImport(
    workflow: DelegatedWorkflow,
  ): Promise<DelegatedClassifierDraftImportContext> {
    return this.importContext(
      workflow,
      await this.importOperation(() =>
        this.imports.getStatus(workflow.record.id, workflow.record.sellerId),
      ),
    );
  }

  private reviewContext(
    workflow: DelegatedWorkflow,
    review: SellerClassifierReviewSnapshot,
  ): DelegatedClassifierReviewContext {
    return {
      seller: workflow.seller,
      review: {
        ...review,
        groups: review.groups.map((group) => ({
          ...group,
          images: group.images.map((image) => ({
            ...image,
            thumbnailUrl:
              `/v1/admin/classifier-uploads/${encodeURIComponent(workflow.record.id)}` +
              `/images/${encodeURIComponent(image.imageId)}/thumbnail`,
          })),
        })),
      },
    };
  }

  private importContext(
    workflow: DelegatedWorkflow,
    draftImport: SellerClassifierDraftImportSnapshot,
  ): DelegatedClassifierDraftImportContext {
    return { seller: workflow.seller, draftImport };
  }

  private requireStartedImport(
    workflow: DelegatedWorkflow,
    context: DelegatedClassifierDraftImportContext,
  ): DelegatedClassifierDraftImportContext {
    if (!context.draftImport.importStatus) throw delegatedActionAuditUnavailable();
    return this.importContext(workflow, context.draftImport);
  }

  private async withWorkflow<TResult>(
    workflowId: string,
    operation: (workflow: DelegatedWorkflow) => Promise<TResult> | TResult,
  ): Promise<TResult> {
    let record: SellerClassifierBatchRecord | null;
    try {
      record = await this.workflows.findWorkflow(workflowId);
    } catch (error) {
      if (error instanceof DelegatedClassifierUploadRepositoryError) {
        throw delegatedClassifierUnavailable();
      }
      throw error;
    }
    if (!record || record.initiatorKind !== "administrator") {
      throw delegatedUploadWorkflowNotFound();
    }

    let seller: DelegatedUploadSeller | null;
    try {
      seller = await this.workflows.findSeller(record.sellerId);
    } catch (error) {
      if (error instanceof DelegatedClassifierUploadRepositoryError) {
        throw delegatedClassifierUnavailable();
      }
      throw error;
    }
    if (!seller) throw delegatedUploadWorkflowNotFound();
    return operation({ seller, record });
  }

  private async reviewOperation<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SellerClassifierBatchError) throw mapReviewError(error);
      throw error;
    }
  }

  private async importOperation<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SellerClassifierBatchError) throw mapImportError(error);
      throw error;
    }
  }

  private async auditOperation<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DelegatedAdministratorActionRepositoryError) {
        throw delegatedActionAuditUnavailable();
      }
      throw error;
    }
  }
}

function requireGroup(
  review: SellerClassifierReviewSnapshot,
  groupId: string,
): SellerClassifierReviewSnapshot["groups"][number] {
  const group = review.groups.find((candidate) => candidate.groupId === groupId);
  if (!group) throw delegatedReviewResourceNotFound();
  return group;
}

function requireApprovedGroup(review: SellerClassifierReviewSnapshot, groupId: string): void {
  if (requireGroup(review, groupId).status !== "approved") {
    throw delegatedActionAuditUnavailable();
  }
}

function requireAllGroupsApproved(review: SellerClassifierReviewSnapshot): void {
  if (review.groups.length === 0 || review.groups.some((group) => group.status !== "approved")) {
    throw delegatedReviewNotAllowed();
  }
}

function mapReviewError(error: SellerClassifierBatchError): Error {
  if (error.code === "seller_classifier_review_invalid") return delegatedReviewInvalid();
  if (
    error.code === "seller_classifier_review_resource_not_found" ||
    error.code === "seller_classifier_thumbnail_not_found"
  ) {
    return delegatedReviewResourceNotFound();
  }
  if (
    error.code === "seller_classifier_review_not_allowed" ||
    error.code === "seller_classifier_groups_not_approved"
  ) {
    return delegatedReviewNotAllowed();
  }
  if (error.code === "seller_classifier_batch_not_found") {
    return delegatedUploadWorkflowNotFound();
  }
  return delegatedClassifierUnavailable();
}

function mapImportError(error: SellerClassifierBatchError): Error {
  if (error.code === "seller_classifier_batch_not_found") {
    return delegatedUploadWorkflowNotFound();
  }
  if (error.code === "seller_classifier_groups_not_approved") {
    return delegatedReviewNotAllowed();
  }
  if (error.code === "seller_classifier_import_retry_not_allowed") {
    return delegatedImportRetryNotAllowed();
  }
  if (error.code === "seller_classifier_unavailable") {
    return delegatedClassifierUnavailable();
  }
  return delegatedImportUnavailable();
}
