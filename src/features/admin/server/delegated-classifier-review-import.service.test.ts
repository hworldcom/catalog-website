import { describe, expect, it, vi } from "vitest";

import { SellerClassifierBatchError } from "@/features/seller-classifier/seller-classifier-batch.types";
import type { SellerClassifierDraftImportSnapshot } from "@/features/seller-classifier/seller-classifier-import.types";
import type { SellerClassifierReviewSnapshot } from "@/features/seller-classifier/seller-classifier-review.types";
import type { SellerClassifierBatchRecord } from "@/features/seller-classifier/server/seller-classifier-batch.repository";

import type { DelegatedAdministratorActionRepository } from "./delegated-administrator-action.repository";
import { DelegatedAdministratorActionService } from "./delegated-administrator-action.service";
import type { DelegatedClassifierUploadRepository } from "./delegated-classifier-upload.repository";
import { DelegatedClassifierReviewImportService } from "./delegated-classifier-review-import.service";

describe("DelegatedClassifierReviewImportService", () => {
  it("reads an administrator workflow under its immutable seller and rewrites thumbnails", async () => {
    const subject = setup();

    await expect(subject.service.getReview(workflowId)).resolves.toMatchObject({
      seller: { sellerId, name: "Kesar Textiles" },
      review: {
        workflowId,
        groups: [
          {
            images: [
              {
                imageId,
                thumbnailUrl: `/v1/admin/classifier-uploads/${workflowId}/images/${imageId}/thumbnail`,
              },
            ],
          },
        ],
      },
    });
    expect(subject.review.getReview).toHaveBeenCalledWith(workflowId, sellerId);
  });

  it("does not disclose seller-created workflows or contact the classifier", async () => {
    const subject = setup({ workflow: record({ initiatorKind: "seller" }) });

    await expect(subject.service.getReview(workflowId)).rejects.toMatchObject({
      statusCode: 404,
      code: "delegated_upload_workflow_not_found",
    });
    expect(subject.review.getReview).not.toHaveBeenCalled();
  });

  it("does not disclose a workflow whose stored seller no longer exists", async () => {
    const subject = setup({ sellerExists: false });

    await expect(subject.service.getReview(workflowId)).rejects.toMatchObject({
      statusCode: 404,
      code: "delegated_upload_workflow_not_found",
    });
    expect(subject.review.getReview).not.toHaveBeenCalled();
  });

  it("passes the stored seller to low-level review mutations", async () => {
    const subject = setup();

    await subject.service.selectCategory({
      workflowId,
      groupId,
      categorySlug: "t-shirts",
    });

    expect(subject.review.selectCategory).toHaveBeenCalledWith(sellerId, {
      workflowId,
      groupId,
      categorySlug: "t-shirts",
    });
  });

  it("audits group approval and reconciles an already-approved classifier group", async () => {
    const subject = setup({ reviewSnapshot: reviewSnapshot("approved") });

    await subject.service.approveGroup({ workflowId, groupId, requestId }, administratorId);

    expect(subject.actionRepository.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        workflowId,
        administratorUserId: administratorId,
        actionType: "approve_group",
        targetId: groupId,
      }),
    );
    expect(subject.review.approveGroup).not.toHaveBeenCalled();
    expect(subject.actionRepository.finalizeSuccess).toHaveBeenCalledWith(requestId, attemptToken);
  });

  it("approves and imports drafts under the stored seller", async () => {
    const subject = setup({ reviewSnapshot: reviewSnapshot("approved", "review") });

    await subject.service.approveBatchAndCreateDrafts({ workflowId, requestId }, administratorId);

    expect(subject.imports.approveAndCreateDrafts).toHaveBeenCalledWith(
      workflowId,
      sellerId,
      administratorId,
    );
    expect(subject.actionRepository.finalizeSuccess).toHaveBeenCalled();
  });

  it("uses the server-resolved import run as the audited retry target", async () => {
    const subject = setup({
      importSnapshot: importSnapshot({
        importStatus: "completed_with_errors",
        retryAllowed: true,
      }),
    });

    await subject.service.retryDraftImport({ workflowId, requestId }, administratorId);

    expect(subject.actionRepository.findImportRunId).toHaveBeenCalledWith(workflowId, sellerId);
    expect(subject.actionRepository.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "retry_draft_import",
        targetId: importRunId,
      }),
    );
    expect(subject.imports.retry).toHaveBeenCalledWith(workflowId, sellerId);
  });

  it("maps another workflow's resource to the delegated non-disclosing error", async () => {
    const subject = setup();
    subject.review.selectCover.mockRejectedValueOnce(
      new SellerClassifierBatchError(
        404,
        "seller_classifier_review_resource_not_found",
        "not found",
      ),
    );

    await expect(
      subject.service.selectCover({ workflowId, groupId, imageId: uuid(99) }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "delegated_review_resource_not_found",
    });
  });
});

function setup(
  options: {
    workflow?: SellerClassifierBatchRecord | null;
    sellerExists?: boolean;
    reviewSnapshot?: SellerClassifierReviewSnapshot;
    importSnapshot?: SellerClassifierDraftImportSnapshot;
  } = {},
) {
  const currentReview = options.reviewSnapshot ?? reviewSnapshot();
  const workflows = {
    searchSellers: vi.fn(),
    findWorkflow: vi.fn(async () => (options.workflow === undefined ? record() : options.workflow)),
    findSeller: vi.fn(async () => (options.sellerExists === false ? null : seller())),
  } satisfies DelegatedClassifierUploadRepository;
  const review = {
    getReview: vi.fn(async () => structuredClone(currentReview)),
    listCategories: vi.fn(async () => []),
    createGroup: vi.fn(async () => structuredClone(currentReview)),
    mergeGroups: vi.fn(async () => structuredClone(currentReview)),
    splitGroup: vi.fn(async () => structuredClone(currentReview)),
    moveImage: vi.fn(async () => structuredClone(currentReview)),
    setDuplicate: vi.fn(async () => structuredClone(currentReview)),
    selectCover: vi.fn(async () => structuredClone(currentReview)),
    selectCategory: vi.fn(async () => structuredClone(currentReview)),
    rejectImage: vi.fn(async () => structuredClone(currentReview)),
    restoreImage: vi.fn(async () => structuredClone(currentReview)),
    approveGroup: vi.fn(async () => structuredClone(reviewSnapshot("approved"))),
    getThumbnail: vi.fn(async () => new Uint8Array([255, 216, 255, 217])),
  };
  const imports = {
    approveAndCreateDrafts: vi.fn(async () => importSnapshot({ importStatus: "pending" })),
    getStatus: vi.fn(async () => options.importSnapshot ?? importSnapshot()),
    retry: vi.fn(async () => importSnapshot({ importStatus: "pending" })),
  };
  const actionRepository = {
    claim: vi.fn<DelegatedAdministratorActionRepository["claim"]>(async (input) => ({
      operation: "claimed",
      sellerId,
      targetId: input.targetId,
      status: "running",
      attemptCount: 1,
      attemptToken,
      errorCode: null,
    })),
    finalizeSuccess: vi.fn(async () => true),
    finalizeFailure: vi.fn(async () => true),
    findImportRunId: vi.fn(async () => importRunId),
  } satisfies DelegatedAdministratorActionRepository;
  const actions = new DelegatedAdministratorActionService(actionRepository, {
    actionTimeoutMs: 1_000,
    leaseTimeoutSeconds: 120,
  });

  return {
    workflows,
    review,
    imports,
    actionRepository,
    service: new DelegatedClassifierReviewImportService(
      workflows,
      review,
      imports,
      actions,
      actionRepository,
    ),
  };
}

function reviewSnapshot(
  groupStatus: "proposed" | "approved" = "proposed",
  stage: SellerClassifierReviewSnapshot["stage"] = "review",
): SellerClassifierReviewSnapshot {
  return {
    workflowId,
    stage,
    pipelineVersion: "product-classification-v1",
    groups: [
      {
        groupId,
        status: groupStatus,
        confidence: 0.95,
        coverImageId: imageId,
        suggestedCategorySlug: "t-shirts",
        approvedCategorySlug: "t-shirts",
        categorySuggestionStatus: groupStatus === "approved" ? null : "ready",
        approvedCategorySource: "machine_suggestion",
        warnings: [],
        images: [
          {
            imageId,
            originalFilename: "shirt.jpg",
            uploadOrder: 0,
            thumbnailUrl: "/classifier/internal/thumbnail",
            position: 0,
            isDuplicate: false,
            isRejected: false,
            duplicateOfImageId: null,
            membershipSource: "engine",
            membershipConfidence: 0.95,
          },
        ],
      },
    ],
  };
}

function importSnapshot(
  overrides: Partial<SellerClassifierDraftImportSnapshot> = {},
): SellerClassifierDraftImportSnapshot {
  return {
    workflowId,
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
    ...overrides,
  };
}

function record(overrides: Partial<SellerClassifierBatchRecord> = {}): SellerClassifierBatchRecord {
  return {
    id: workflowId,
    sellerId,
    clientRequestId: uuid(10),
    classifierOrganizationId: uuid(11),
    classifierBatchId: uuid(12),
    maxFiles: 20,
    maxFileSizeBytes: 20 * 1024 * 1024,
    provisioningStatus: "ready",
    lastKnownStage: "review",
    originalFileCount: 1,
    processedFileCount: 1,
    groupCount: 1,
    productDraftCount: 0,
    errorCode: null,
    retryable: false,
    initiatedByUserId: administratorId,
    initiatorKind: "administrator",
    createdAt: "2026-07-30T10:00:00Z",
    updatedAt: "2026-07-30T10:01:00Z",
    ...overrides,
  };
}

function seller() {
  return {
    sellerId,
    name: "Kesar Textiles",
    slug: "kesar-textiles",
    published: true,
  };
}

const workflowId = uuid(1);
const sellerId = uuid(2);
const administratorId = uuid(3);
const groupId = uuid(4);
const imageId = uuid(5);
const requestId = uuid(6);
const attemptToken = uuid(7);
const importRunId = uuid(8);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
