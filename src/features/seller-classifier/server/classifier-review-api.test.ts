import { describe, expect, it, vi } from "vitest";

import { ClassifierReviewClientError, HttpClassifierReviewClient } from "./classifier-review-api";

describe("HttpClassifierReviewClient", () => {
  it("uses every durable review endpoint with the exact command payload", async () => {
    const fetchImplementation = vi.fn(async () => Response.json(reviewSnapshot()));
    const client = createClient(fetchImplementation);

    await client.createGroup(batchId, [imageId]);
    await client.mergeGroups(groupId, [otherGroupId]);
    await client.splitGroup(groupId, [imageId]);
    await client.moveImage(otherGroupId, imageId);
    await client.setDuplicate(groupId, imageId, retainedImageId);
    await client.selectCover(groupId, imageId);
    await client.selectCategory(groupId, categoryId);
    await client.rejectImage(groupId, imageId);
    await client.restoreImage(groupId, imageId);
    await client.approveGroup(groupId);
    await client.approveBatch(batchId);

    expect(
      fetchImplementation.mock.calls.map(([input, init]) => ({
        path: new URL(String(input)).pathname,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })),
    ).toEqual([
      {
        path: `/v1/upload-batches/${batchId}/groups`,
        method: "POST",
        body: { imageIds: [imageId] },
      },
      {
        path: "/v1/groups/merge",
        method: "POST",
        body: { targetGroupId: groupId, sourceGroupIds: [otherGroupId] },
      },
      {
        path: `/v1/groups/${groupId}/split`,
        method: "POST",
        body: { imageIds: [imageId] },
      },
      {
        path: `/v1/groups/${otherGroupId}/images`,
        method: "POST",
        body: { imageId },
      },
      {
        path: `/v1/groups/${groupId}/images/${imageId}`,
        method: "PATCH",
        body: { isDuplicate: true, duplicateOfImageId: retainedImageId },
      },
      {
        path: `/v1/groups/${groupId}`,
        method: "PATCH",
        body: { coverImageId: imageId },
      },
      {
        path: `/v1/groups/${groupId}`,
        method: "PATCH",
        body: { approvedCategoryId: categoryId },
      },
      {
        path: `/v1/groups/${groupId}/images/${imageId}/reject`,
        method: "POST",
        body: null,
      },
      {
        path: `/v1/groups/${groupId}/images/${imageId}/restore-rejection`,
        method: "POST",
        body: null,
      },
      {
        path: `/v1/groups/${groupId}/approve`,
        method: "POST",
        body: null,
      },
      {
        path: `/v1/upload-batches/${batchId}/approve`,
        method: "POST",
        body: null,
      },
    ]);
  });

  it("strictly validates review and category responses", async () => {
    const malformedReview = { ...reviewSnapshot(), objectKey: "must-not-pass" };
    const reviewClient = createClient(async () => Response.json(malformedReview));
    await expect(reviewClient.getReview(batchId)).rejects.toMatchObject({
      operation: "read_review",
      statusCode: null,
    });

    const categoryClient = createClient(async () =>
      Response.json([{ id: categoryId, slug: "t-shirts", parentId: null }]),
    );
    await expect(categoryClient.listCategories()).rejects.toMatchObject({
      operation: "list_categories",
      statusCode: null,
    });
  });

  it("returns only nonempty JPEG thumbnail bytes", async () => {
    const client = createClient(
      async () =>
        new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { "Content-Type": "image/jpeg" },
        }),
    );

    await expect(client.getThumbnail(batchId, imageId)).resolves.toEqual(
      new Uint8Array([255, 216, 255, 217]),
    );
  });

  it("retains stable classifier status and code without exposing its message", async () => {
    const client = createClient(async () =>
      Response.json(
        {
          detail: {
            code: "review_edit_not_allowed",
            message: "internal details",
          },
        },
        { status: 409 },
      ),
    );

    try {
      await client.approveGroup(groupId);
      throw new Error("Expected approval to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ClassifierReviewClientError);
      expect(error).toMatchObject({
        operation: "approve_group",
        statusCode: 409,
        classifierCode: "review_edit_not_allowed",
        message: "The classifier review request failed.",
      });
    }
  });
});

function createClient(fetchImplementation: typeof fetch) {
  return new HttpClassifierReviewClient({
    baseUrl: "http://classifier.test",
    timeoutMs: 100,
    fetchImplementation,
  });
}

function reviewSnapshot() {
  return {
    batchId,
    organizationId,
    status: "review_required",
    pipelineVersion: "2026-06-01",
    groups: [
      {
        groupId,
        status: "proposed",
        confidence: 0.95,
        coverImageId: imageId,
        suggestedCategorySlug: "t-shirts",
        approvedCategorySlug: "t-shirts",
        categorySuggestionStatus: "ready",
        approvedCategorySource: "machine_suggestion",
        possibleExistingProductId: null,
        warnings: [],
        images: [
          {
            imageId,
            originalFilename: "front.jpg",
            uploadOrder: 0,
            thumbnailUrl: `/internal/${imageId}`,
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

const batchId = uuid(1);
const organizationId = uuid(2);
const groupId = uuid(3);
const otherGroupId = uuid(4);
const imageId = uuid(5);
const retainedImageId = uuid(6);
const categoryId = uuid(7);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
