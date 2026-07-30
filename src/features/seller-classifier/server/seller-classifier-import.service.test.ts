import { describe, expect, it, vi } from "vitest";

import type { ApprovedGroupsReader } from "@/features/admin/server/classifier-import.worker";
import type { ClassifierImportDispatcher } from "@/features/admin/server/classifier-import.dispatcher";
import type {
  ApprovedGroupsSnapshot,
  ClassifierImportGroupOutcome,
  ClassifierImportRun,
} from "@/features/admin/server/classifier-import.types";

import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import type { SellerClassifierReviewSnapshot } from "../seller-classifier-review.types";
import type {
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
} from "./seller-classifier-batch.repository";
import type { SellerClassifierImportRepository } from "./seller-classifier-import.repository";
import {
  SellerClassifierImportService,
  type SellerClassifierBatchApprovalService,
} from "./seller-classifier-import.service";

describe("SellerClassifierImportService", () => {
  it("approves, validates the export, creates one owned import, and dispatches it in order", async () => {
    const calls: string[] = [];
    const subject = setup({
      importOverrides: {
        findBySource: vi.fn(async () => {
          calls.push("lookup");
          return null;
        }),
        createOrGetOwned: vi.fn(async () => {
          calls.push("bind");
          return { operation: "created" as const, run: importRun() };
        }),
      },
      approve: vi.fn(async () => {
        calls.push("approve");
        return reviewSnapshot();
      }),
      getApprovedGroups: vi.fn(async () => {
        calls.push("export");
        return approvedSnapshot();
      }),
      dispatch: vi.fn(async () => {
        calls.push("dispatch");
        return "accepted" as const;
      }),
    });

    await expect(
      subject.service.approveAndCreateDrafts(workflowId, sellerId, userId),
    ).resolves.toMatchObject({
      workflowId,
      stage: "importing",
      importStatus: "pending",
      continuationAllowed: true,
    });
    expect(calls).toEqual(["lookup", "approve", "export", "bind", "dispatch"]);
  });

  it("binds and returns an existing source import without repeating classifier approval", async () => {
    const approve = vi.fn(async () => reviewSnapshot());
    const getApprovedGroups = vi.fn(async () => approvedSnapshot());
    const subject = setup({
      importOverrides: {
        findBySource: vi.fn(async () => importRun()),
        createOrGetOwned: vi.fn(async () => ({
          operation: "existing" as const,
          run: importRun({ status: "completed", seller_classifier_workflow_id: workflowId }),
        })),
        findOwned: vi.fn(async () =>
          importRun({ status: "completed", seller_classifier_workflow_id: workflowId }),
        ),
      },
      workflowOverrides: { lastKnownStage: "drafts_ready" },
      approve,
      getApprovedGroups,
    });

    await expect(
      subject.service.approveAndCreateDrafts(workflowId, sellerId, userId),
    ).resolves.toMatchObject({
      stage: "drafts_ready",
      importStatus: "completed",
      continuationAllowed: false,
    });
    expect(approve).not.toHaveBeenCalled();
    expect(getApprovedGroups).not.toHaveBeenCalled();
    expect(subject.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("returns an approved continuation snapshot without creating side effects", async () => {
    const subject = setup({
      importOverrides: {
        findOwned: vi.fn(async () => null),
      },
      workflowOverrides: { lastKnownStage: "approved", groupCount: 2 },
    });

    await expect(subject.service.getStatus(workflowId, sellerId)).resolves.toEqual({
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
    });
    expect(subject.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("returns seller-safe durable counts and ProductDraft summaries", async () => {
    const subject = setup({
      workflowOverrides: {
        lastKnownStage: "failed",
        errorCode: "seller_classifier_import_incomplete",
        retryable: true,
      },
      importOverrides: {
        findOwned: vi.fn(async () =>
          importRun({
            status: "completed_with_errors",
            seller_classifier_workflow_id: workflowId,
          }),
        ),
        listGroupOutcomes: vi.fn(async () => [
          outcome("complete", productDraftId, 0),
          outcome("failed", failedProductDraftId, 1),
        ]),
        getActionState: vi.fn(async () => ({ canRetryTemporary: true })),
        listProductDrafts: vi.fn(async () => [
          {
            productDraftId,
            title: "Cotton shirt",
            status: "draft" as const,
            imageStatus: "available" as const,
          },
          {
            productDraftId: failedProductDraftId,
            title: null,
            status: "draft" as const,
            imageStatus: "partially_available" as const,
          },
        ]),
      },
    });

    const result = await subject.service.getStatus(workflowId, sellerId);
    expect(result).toMatchObject({
      stage: "failed",
      importStatus: "completed_with_errors",
      retryAllowed: true,
      completeGroupCount: 1,
      failedGroupCount: 1,
      productDrafts: [
        { productDraftId, imageStatus: "available" },
        { productDraftId: failedProductDraftId, imageStatus: "partially_available" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(batchId);
    expect(JSON.stringify(result)).not.toContain(organizationId);
    expect(JSON.stringify(result)).not.toContain(sellerId);
  });

  it("requeues only a retryable owned import and dispatches the same identifier", async () => {
    const retry = vi.fn(async () => "requeued" as const);
    const subject = setup({
      workflowOverrides: {
        lastKnownStage: "failed",
        errorCode: "seller_classifier_import_incomplete",
        retryable: true,
      },
      importOverrides: {
        findOwned: vi
          .fn()
          .mockResolvedValueOnce(
            importRun({
              status: "completed_with_errors",
              seller_classifier_workflow_id: workflowId,
            }),
          )
          .mockResolvedValueOnce(
            importRun({
              status: "completed_with_errors",
              seller_classifier_workflow_id: workflowId,
            }),
          )
          .mockResolvedValue(
            importRun({ status: "pending", seller_classifier_workflow_id: workflowId }),
          ),
        getActionState: vi.fn(async () => ({ canRetryTemporary: true })),
        retry,
      },
    });

    await subject.service.retry(workflowId, sellerId);

    expect(retry).toHaveBeenCalledWith(importId);
    expect(subject.dispatcher.dispatch).toHaveBeenCalledWith(importId);
  });

  it("does not contact the classifier or import source for another seller's workflow", async () => {
    const subject = setup({
      workflowRepositoryOverrides: {
        findOwned: vi.fn(async () => null),
      },
    });

    await expectError(
      subject.service.approveAndCreateDrafts(workflowId, otherSellerId, userId),
      404,
      "seller_classifier_batch_not_found",
    );
    expect(subject.imports.findBySource).not.toHaveBeenCalled();
    expect(subject.approval.approveBatchForImport).not.toHaveBeenCalled();
  });
});

function setup(
  options: {
    workflowOverrides?: Partial<SellerClassifierBatchRecord>;
    workflowRepositoryOverrides?: Partial<SellerClassifierBatchRepository>;
    importOverrides?: Partial<SellerClassifierImportRepository>;
    approve?: SellerClassifierBatchApprovalService["approveBatchForImport"];
    getApprovedGroups?: ApprovedGroupsReader["getApprovedGroups"];
    dispatch?: ClassifierImportDispatcher["dispatch"];
  } = {},
) {
  const record = workflow(options.workflowOverrides);
  const workflows = {
    createOrGet: vi.fn(),
    findOwned: vi.fn(async () => record),
    completeProvisioning: vi.fn(),
    failProvisioning: vi.fn(),
    claimRetry: vi.fn(),
    recordObservation: vi.fn(),
    recordReviewObservation: vi.fn(),
    recordApproved: vi.fn(),
    ...options.workflowRepositoryOverrides,
  } satisfies SellerClassifierBatchRepository;
  const imports = {
    findBySource: vi.fn(async () => null),
    createOrGetOwned: vi.fn(async () => ({
      operation: "created" as const,
      run: importRun(),
    })),
    findOwned: vi.fn(async () => importRun()),
    listGroupOutcomes: vi.fn(async () => []),
    getActionState: vi.fn(async () => ({ canRetryTemporary: false })),
    listProductDrafts: vi.fn(async () => []),
    retry: vi.fn(async () => "not_allowed" as const),
    ...options.importOverrides,
  } satisfies SellerClassifierImportRepository;
  const approval = {
    approveBatchForImport: vi.fn(options.approve ?? (async () => reviewSnapshot())),
  } satisfies SellerClassifierBatchApprovalService;
  const approvedGroups = {
    getApprovedGroups: vi.fn(options.getApprovedGroups ?? (async () => approvedSnapshot())),
  } satisfies ApprovedGroupsReader;
  const dispatcher = {
    dispatch: vi.fn(options.dispatch ?? (async () => "accepted" as const)),
  } satisfies ClassifierImportDispatcher;
  return {
    workflows,
    imports,
    approval,
    dispatcher,
    service: new SellerClassifierImportService(
      workflows,
      imports,
      approval,
      approvedGroups,
      dispatcher,
      organizationId,
      900,
      () => Date.parse("2026-07-28T10:00:00Z"),
    ),
  };
}

function workflow(
  overrides: Partial<SellerClassifierBatchRecord> = {},
): SellerClassifierBatchRecord {
  return {
    id: workflowId,
    sellerId,
    clientRequestId: uuid(10),
    classifierOrganizationId: organizationId,
    classifierBatchId: batchId,
    maxFiles: 20,
    maxFileSizeBytes: 20 * 1024 * 1024,
    provisioningStatus: "ready",
    lastKnownStage: "importing",
    originalFileCount: 2,
    processedFileCount: 2,
    groupCount: 2,
    productDraftCount: 0,
    errorCode: null,
    retryable: false,
    initiatedByUserId: userId,
    initiatorKind: "seller",
    createdAt: "2026-07-28T09:00:00Z",
    updatedAt: "2026-07-28T09:00:00Z",
    ...overrides,
  };
}

function importRun(overrides: Partial<ClassifierImportRun> = {}): ClassifierImportRun {
  return {
    id: importId,
    classifier_organization_id: organizationId,
    classifier_batch_id: batchId,
    seller_id: sellerId,
    seller_classifier_workflow_id: workflowId,
    pipeline_version: null,
    status: "pending",
    operation_kind: "import",
    requested_by_user_id: userId,
    attempt_count: 0,
    attempt_token: null,
    claim_started_at: null,
    last_heartbeat_at: null,
    error_code: null,
    retryable: false,
    retry_policy: "retryable_only",
    created_at: "2026-07-28T09:00:00Z",
    completed_at: null,
    updated_at: "2026-07-28T09:00:00Z",
    ...overrides,
  };
}

function outcome(
  status: ClassifierImportGroupOutcome["status"],
  draftId: string,
  position: number,
): ClassifierImportGroupOutcome {
  return {
    classifier_import_run_id: importId,
    classifier_group_id: uuid(30 + position),
    product_draft_id: draftId,
    approved_category_slug: "t-shirts",
    source_cover_classifier_image_id: uuid(40 + position),
    source_group_position: position,
    status,
    error_code: status === "failed" ? "image_read_failed" : null,
    retryable: status === "failed",
    created_at: "2026-07-28T09:00:00Z",
    updated_at: "2026-07-28T09:00:00Z",
  };
}

function reviewSnapshot(): SellerClassifierReviewSnapshot {
  return {
    workflowId,
    stage: "approved",
    pipelineVersion: "2026-06-01",
    groups: [
      {
        groupId: uuid(30),
        status: "approved",
        confidence: 0.9,
        coverImageId: uuid(40),
        suggestedCategorySlug: "t-shirts",
        approvedCategorySlug: "t-shirts",
        categorySuggestionStatus: null,
        approvedCategorySource: "machine_suggestion",
        warnings: [],
        images: [],
      },
    ],
  };
}

function approvedSnapshot(): ApprovedGroupsSnapshot {
  return {
    batchId,
    organizationId,
    status: "approved",
    pipelineVersion: "2026-06-01",
    groups: [
      {
        groupId: uuid(30),
        approvedCategorySlug: "t-shirts",
        suggestedCategorySlug: "t-shirts",
        coverImageId: uuid(40),
        confidence: 0.9,
        images: [
          {
            imageId: uuid(40),
            position: 0,
            isDuplicate: false,
            duplicateOfImageId: null,
          },
        ],
      },
    ],
  };
}

async function expectError(
  promise: Promise<unknown>,
  statusCode: number,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(SellerClassifierBatchError);
    expect(error).toMatchObject({ statusCode, code });
  }
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

const workflowId = uuid(1);
const sellerId = uuid(2);
const otherSellerId = uuid(3);
const organizationId = uuid(4);
const batchId = uuid(5);
const userId = uuid(6);
const importId = uuid(7);
const productDraftId = uuid(8);
const failedProductDraftId = uuid(9);
