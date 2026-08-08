import { describe, expect, it, vi } from "vitest";

import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import {
  ClassifierReviewClientError,
  type ClassifierReviewClient,
  type ClassifierReviewSnapshot,
} from "./classifier-review-api";
import type {
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
} from "./seller-classifier-batch.repository";
import { SellerClassifierReviewService } from "./seller-classifier-review.service";

describe("SellerClassifierReviewService", () => {
  it("sanitizes the owned review snapshot and records the exact group count", async () => {
    const { repository, service } = setup();

    const result = await service.getReview(workflowId, sellerId);

    expect(repository.findOwned).toHaveBeenCalledWith(workflowId, sellerId);
    expect(result).toMatchObject({ workflowId, stage: "review" });
    expect(result.groups[0]).toMatchObject({ groupId });
    expect(result.groups[0]?.images[0]).toMatchObject({ imageId });
    expect(result.groups[0]?.images[0]?.thumbnailUrl).toBe(
      `/v1/seller/classifier-batches/${workflowId}/images/${imageId}/thumbnail`,
    );
    expect(JSON.stringify(result)).not.toContain(batchId);
    expect(JSON.stringify(result)).not.toContain(organizationId);
    expect(JSON.stringify(result)).not.toContain("classifier/internal");
    expect(repository.recordReviewObservation).toHaveBeenCalledWith({
      workflowId,
      sellerId,
      stage: "review",
      groupCount: 2,
    });
  });

  it("accepts an approved categoryless group with a consistent source", async () => {
    const snapshot = reviewSnapshot();
    snapshot.groups[0] = {
      ...snapshot.groups[0]!,
      status: "approved",
      approvedCategorySlug: null,
      approvedCategorySource: "reviewer_cleared",
    };
    const { service } = setup({ snapshot });

    const result = await service.getReview(workflowId, sellerId);

    expect(result.groups[0]).toMatchObject({
      groupId,
      status: "approved",
      approvedCategorySlug: null,
      approvedCategorySource: "reviewer_cleared",
    });
  });

  it("rejects an inconsistent categoryless approved-category source", async () => {
    const snapshot = reviewSnapshot();
    snapshot.groups[0] = {
      ...snapshot.groups[0]!,
      status: "approved",
      approvedCategorySlug: null,
      approvedCategorySource: "machine_suggestion",
    };
    const { service } = setup({ snapshot });

    await expectError(
      service.getReview(workflowId, sellerId),
      503,
      "seller_classifier_unavailable",
    );
  });

  it("does not contact the classifier for another seller's workflow", async () => {
    const { repository, classifier, service } = setup();
    repository.findOwned.mockResolvedValueOnce(null);

    await expectError(
      service.getReview(workflowId, otherSellerId),
      404,
      "seller_classifier_batch_not_found",
    );
    expect(classifier.getReview).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "create",
      run: (service: SellerClassifierReviewService) =>
        service.createGroup(sellerId, { workflowId, imageIds: [imageId] }),
      method: "createGroup" as const,
    },
    {
      name: "merge",
      run: (service: SellerClassifierReviewService) =>
        service.mergeGroups(sellerId, {
          workflowId,
          targetGroupId: groupId,
          sourceGroupIds: [otherGroupId],
        }),
      method: "mergeGroups" as const,
    },
    {
      name: "split",
      run: (service: SellerClassifierReviewService) =>
        service.splitGroup(sellerId, { workflowId, groupId, imageIds: [duplicateImageId] }),
      method: "splitGroup" as const,
    },
    {
      name: "move",
      run: (service: SellerClassifierReviewService) =>
        service.moveImage(sellerId, {
          workflowId,
          targetGroupId: otherGroupId,
          imageId,
        }),
      method: "moveImage" as const,
    },
    {
      name: "duplicate",
      run: (service: SellerClassifierReviewService) =>
        service.setDuplicate(sellerId, {
          workflowId,
          groupId,
          imageId: duplicateImageId,
          duplicateOfImageId: imageId,
        }),
      method: "setDuplicate" as const,
    },
    {
      name: "cover",
      run: (service: SellerClassifierReviewService) =>
        service.selectCover(sellerId, { workflowId, groupId, imageId }),
      method: "selectCover" as const,
    },
    {
      name: "reject",
      run: (service: SellerClassifierReviewService) =>
        service.rejectImage(sellerId, { workflowId, groupId, imageId }),
      method: "rejectImage" as const,
    },
    {
      name: "restore",
      run: (service: SellerClassifierReviewService) =>
        service.restoreImage(sellerId, { workflowId, groupId, imageId }),
      method: "restoreImage" as const,
    },
    {
      name: "approve",
      run: (service: SellerClassifierReviewService) =>
        service.approveGroup(sellerId, { workflowId, groupId }),
      method: "approveGroup" as const,
    },
  ])("preflights and accepts a complete snapshot for $name", async ({ run, method }) => {
    const { classifier, repository, service } = setup();

    await expect(run(service)).resolves.toMatchObject({ workflowId, stage: "review" });

    expect(classifier.getReview).toHaveBeenCalledBefore(classifier[method]);
    expect(classifier[method]).toHaveBeenCalledOnce();
    expect(repository.recordReviewObservation).toHaveBeenCalledTimes(2);
  });

  it("resolves a fresh selectable category slug to its internal identifier", async () => {
    const { classifier, service } = setup();

    await service.selectCategory(sellerId, {
      workflowId,
      groupId,
      categorySlug: "t-shirts",
    });

    expect(classifier.listCategories).toHaveBeenCalledOnce();
    expect(classifier.selectCategory).toHaveBeenCalledWith(groupId, categoryId);
  });

  it("rejects malformed taxonomies and parent category selections", async () => {
    const { classifier, service } = setup();
    classifier.listCategories.mockResolvedValueOnce([
      category(categoryId, "clothing", null),
      category(otherCategoryId, "t-shirts", categoryId),
    ]);

    await expectError(
      service.selectCategory(sellerId, {
        workflowId,
        groupId,
        categorySlug: "clothing",
      }),
      400,
      "seller_classifier_review_invalid",
    );
    expect(classifier.selectCategory).not.toHaveBeenCalled();

    classifier.listCategories.mockResolvedValueOnce([
      category(categoryId, "clothing", otherCategoryId),
      category(otherCategoryId, "t-shirts", categoryId),
    ]);
    await expectError(service.listCategories(), 503, "seller_classifier_unavailable");
  });

  it("rejects approved-group edits and stale resources before mutation", async () => {
    const approved = reviewSnapshot();
    approved.groups[0] = {
      ...approved.groups[0]!,
      status: "approved",
      categorySuggestionStatus: null,
    };
    const first = setup({ snapshot: approved });
    await expectError(
      first.service.selectCover(sellerId, { workflowId, groupId, imageId }),
      409,
      "seller_classifier_review_not_allowed",
    );
    expect(first.classifier.selectCover).not.toHaveBeenCalled();

    const second = setup();
    await expectError(
      second.service.rejectImage(sellerId, {
        workflowId,
        groupId,
        imageId: unknownImageId,
      }),
      404,
      "seller_classifier_review_resource_not_found",
    );
    expect(second.classifier.rejectImage).not.toHaveBeenCalled();
  });

  it("rejects mismatched successful snapshots and sanitizes classifier failures", async () => {
    const mismatch = reviewSnapshot();
    mismatch.organizationId = otherOrganizationId;
    const first = setup({ snapshot: mismatch });
    await expectError(
      first.service.getReview(workflowId, sellerId),
      503,
      "seller_classifier_unavailable",
    );

    const second = setup();
    second.classifier.approveGroup.mockRejectedValueOnce(
      new ClassifierReviewClientError("approve_group", 409, "review_edit_not_allowed"),
    );
    await expectError(
      second.service.approveGroup(sellerId, { workflowId, groupId }),
      409,
      "seller_classifier_review_not_allowed",
    );
  });

  it("preflights thumbnail ownership and maps a missing classifier thumbnail", async () => {
    const { classifier, service } = setup();
    classifier.getThumbnail.mockRejectedValueOnce(
      new ClassifierReviewClientError("read_thumbnail", 404, "thumbnail_not_found"),
    );

    await expectError(
      service.getThumbnail(workflowId, imageId, sellerId),
      404,
      "seller_classifier_thumbnail_not_found",
    );
    expect(classifier.getReview).toHaveBeenCalledWith(batchId);
    expect(classifier.getThumbnail).toHaveBeenCalledWith(batchId, imageId);
  });

  it("approves a nonempty fully approved batch and records the durable approved stage", async () => {
    const snapshot = reviewSnapshot();
    snapshot.groups = snapshot.groups.map((group) => ({
      ...group,
      status: "approved",
      categorySuggestionStatus: null,
    }));
    const { classifier, repository, service } = setup({ snapshot });

    await expect(service.approveBatchForImport(workflowId, sellerId)).resolves.toMatchObject({
      workflowId,
      stage: "approved",
    });

    expect(classifier.approveBatch).toHaveBeenCalledWith(batchId);
    expect(repository.recordApproved).toHaveBeenCalledWith({
      workflowId,
      sellerId,
      groupCount: 2,
    });
  });

  it("rejects empty or incomplete review batches before batch approval", async () => {
    const empty = reviewSnapshot();
    empty.groups = [];
    const first = setup({ snapshot: empty });
    await expectError(
      first.service.approveBatchForImport(workflowId, sellerId),
      409,
      "seller_classifier_groups_not_approved",
    );
    expect(first.classifier.approveBatch).not.toHaveBeenCalled();

    const second = setup();
    await expectError(
      second.service.approveBatchForImport(workflowId, sellerId),
      409,
      "seller_classifier_groups_not_approved",
    );
    expect(second.classifier.approveBatch).not.toHaveBeenCalled();
  });
});

function setup({ snapshot = reviewSnapshot() }: { snapshot?: ClassifierReviewSnapshot } = {}) {
  const repository = {
    createOrGet: vi.fn(),
    findOwned: vi.fn(async () => record()),
    completeProvisioning: vi.fn(),
    failProvisioning: vi.fn(),
    claimRetry: vi.fn(),
    recordObservation: vi.fn(),
    recordReviewObservation: vi.fn(async () => ({
      operation: "recorded" as const,
      record: record({ lastKnownStage: snapshot.status === "approved" ? "approved" : "review" }),
    })),
    recordApproved: vi.fn(async () => ({
      operation: "recorded" as const,
      record: record({ lastKnownStage: "approved" }),
    })),
  } satisfies SellerClassifierBatchRepository;
  const classifier = {
    getReview: vi.fn(async () => structuredClone(snapshot)),
    listCategories: vi.fn(async () => [category(categoryId, "t-shirts", null)]),
    createGroup: vi.fn(async () => structuredClone(snapshot)),
    mergeGroups: vi.fn(async () => structuredClone(snapshot)),
    splitGroup: vi.fn(async () => structuredClone(snapshot)),
    moveImage: vi.fn(async () => structuredClone(snapshot)),
    setDuplicate: vi.fn(async () => structuredClone(snapshot)),
    selectCover: vi.fn(async () => structuredClone(snapshot)),
    selectCategory: vi.fn(async () => structuredClone(snapshot)),
    rejectImage: vi.fn(async () => structuredClone(snapshot)),
    restoreImage: vi.fn(async () => structuredClone(snapshot)),
    approveGroup: vi.fn(async () => structuredClone(snapshot)),
    approveBatch: vi.fn(async () =>
      structuredClone({
        ...snapshot,
        status: "approved" as const,
      }),
    ),
    getThumbnail: vi.fn(async () => new Uint8Array([255, 216, 255, 217])),
  } satisfies ClassifierReviewClient;
  return {
    repository,
    classifier,
    service: new SellerClassifierReviewService(repository, classifier, organizationId),
  };
}

function reviewSnapshot(): ClassifierReviewSnapshot {
  return {
    batchId,
    organizationId,
    status: "review_required",
    pipelineVersion: "2026-06-01",
    groups: [
      group(groupId, [image(imageId, 0), image(duplicateImageId, 1)]),
      group(otherGroupId, [image(otherImageId, 0)]),
    ],
  };
}

function group(
  id: string,
  images: ClassifierReviewSnapshot["groups"][number]["images"],
): ClassifierReviewSnapshot["groups"][number] {
  return {
    groupId: id,
    status: "proposed",
    confidence: 0.95,
    coverImageId: images[0]?.imageId ?? null,
    suggestedCategorySlug: "t-shirts",
    approvedCategorySlug: "t-shirts",
    categorySuggestionStatus: "ready",
    approvedCategorySource: "machine_suggestion",
    possibleExistingProductId: uuid(90),
    warnings: [],
    images,
  };
}

function image(
  id: string,
  position: number,
): ClassifierReviewSnapshot["groups"][number]["images"][number] {
  return {
    imageId: id,
    originalFilename: `${position}.jpg`,
    uploadOrder: position,
    thumbnailUrl: `/classifier/internal/${id}`,
    position,
    isDuplicate: false,
    isRejected: false,
    duplicateOfImageId: null,
    membershipSource: "engine",
    membershipConfidence: 0.95,
  };
}

function category(id: string, slug: string, parentId: string | null) {
  return { id, slug, parentId, nameEn: slug };
}

function record(overrides: Partial<SellerClassifierBatchRecord> = {}): SellerClassifierBatchRecord {
  return {
    id: workflowId,
    sellerId,
    clientRequestId: uuid(30),
    classifierOrganizationId: organizationId,
    classifierBatchId: batchId,
    maxFiles: 20,
    maxFileSizeBytes: 20 * 1024 * 1024,
    provisioningStatus: "ready",
    lastKnownStage: "processing",
    originalFileCount: 3,
    processedFileCount: 3,
    groupCount: 0,
    productDraftCount: 0,
    errorCode: null,
    retryable: false,
    initiatedByUserId: uuid(31),
    initiatorKind: "seller",
    createdAt: "2026-07-27T10:00:00Z",
    updatedAt: "2026-07-27T10:00:00Z",
    ...overrides,
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

const workflowId = uuid(1);
const batchId = uuid(2);
const organizationId = uuid(3);
const otherOrganizationId = uuid(4);
const sellerId = uuid(5);
const otherSellerId = uuid(6);
const groupId = uuid(7);
const otherGroupId = uuid(8);
const imageId = uuid(9);
const duplicateImageId = uuid(10);
const otherImageId = uuid(11);
const unknownImageId = uuid(12);
const categoryId = uuid(13);
const otherCategoryId = uuid(14);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
