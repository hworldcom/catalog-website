import { describe, expect, it, vi } from "vitest";

import type { ProductDraftImageDeliveryResponse } from "@/features/admin/server/product-draft-image-delivery.types";

import {
  ProductModerationStatusRepositoryError,
  type ProductModerationStatusDetailRecord,
  type ProductModerationStatusRepository,
} from "./product-moderation-status.repository";
import { ProductModerationStatusService } from "./product-moderation-status.service";

describe("ProductModerationStatusService", () => {
  it("returns one passive detail snapshot with ordered per-image delivery", async () => {
    const repository = memoryRepository(detailRecord());
    const resolve = vi.fn(async (): Promise<ProductDraftImageDeliveryResponse> => ({
      entries: [
        {
          productDraftId: uuid(1),
          images: [delivery(uuid(101), "available"), delivery(uuid(102), "missing")],
        },
      ],
    }));
    const service = new ProductModerationStatusService(repository, { resolve });

    const result = await service.get(uuid(1), uuid(900));

    expect(resolve).toHaveBeenCalledWith([
      { productDraftId: uuid(1), imageIds: [uuid(101), uuid(102)] },
    ]);
    expect(result).toMatchObject({
      productId: uuid(1),
      publicState: "draft",
      review: { submissionId: uuid(2), status: "pending" },
      activation: null,
      submittedRevision: {
        submissionId: uuid(2),
        snapshotSchemaVersion: 1,
        snapshot: { title: "Submitted title" },
        images: [
          { productDraftImageId: uuid(101), position: 0, deliveryStatus: "available" },
          { productDraftImageId: uuid(102), position: 1, deliveryStatus: "missing" },
        ],
      },
    });
  });

  it("keeps moderation state and immutable membership when all image delivery fails", async () => {
    const logger = { error: vi.fn() };
    const service = new ProductModerationStatusService(
      memoryRepository(detailRecord()),
      { resolve: vi.fn().mockRejectedValue(new Error("storage unavailable")) },
      logger,
    );

    const result = await service.get(uuid(1), uuid(900));

    expect(result.review?.status).toBe("pending");
    expect(result.submittedRevision?.images).toEqual([
      expect.objectContaining({
        productDraftImageId: uuid(101),
        deliveryStatus: "unavailable",
        deliveryErrorCode: "product_draft_image_delivery_unavailable",
      }),
      expect.objectContaining({
        productDraftImageId: uuid(102),
        deliveryStatus: "unavailable",
        deliveryErrorCode: "product_draft_image_delivery_unavailable",
      }),
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      "product_moderation_submitted_images_unavailable",
      expect.objectContaining({ productId: uuid(1), imageCount: 2 }),
    );
  });

  it("maps missing, repository, and impossible-state failures to stable errors", async () => {
    await expect(
      new ProductModerationStatusService(memoryRepository(null), { resolve: vi.fn() }).get(
        uuid(1),
        uuid(900),
      ),
    ).rejects.toMatchObject({ code: "product_moderation_not_found", statusCode: 404 });

    const repository = memoryRepository(null);
    repository.getOwnedStatus.mockRejectedValueOnce(
      new ProductModerationStatusRepositoryError("database unavailable"),
    );
    await expect(
      new ProductModerationStatusService(repository, { resolve: vi.fn() }).get(uuid(1), uuid(900)),
    ).rejects.toMatchObject({ code: "product_moderation_status_unavailable", statusCode: 500 });

    const impossible = detailRecord({
      review_status: "approved",
      review_decided_at: "2026-08-16T10:01:00.000Z",
    });
    await expect(
      new ProductModerationStatusService(memoryRepository(impossible), { resolve: vi.fn() }).get(
        uuid(1),
        uuid(900),
      ),
    ).rejects.toMatchObject({ code: "product_moderation_status_unavailable", statusCode: 500 });
  });
});

function memoryRepository(record: ProductModerationStatusDetailRecord | null) {
  return {
    getOwnedStatus: vi.fn(async () => record),
  } satisfies ProductModerationStatusRepository;
}

function detailRecord(
  overrides: Partial<ProductModerationStatusDetailRecord> = {},
): ProductModerationStatusDetailRecord {
  return {
    id: uuid(1),
    status: "draft",
    moderation_revision: 3,
    has_working_copy: false,
    review_submission_id: uuid(2),
    review_kind: "initial_publication",
    review_revision: 3,
    review_status: "pending",
    review_submitted_at: "2026-08-16T10:00:00.000Z",
    review_decided_at: null,
    review_seller_visible_reason: null,
    activation_run_id: null,
    activation_phase: null,
    activation_status: null,
    activation_dispatch_status: null,
    activation_dispatch_generation: null,
    activation_dispatch_error_code: null,
    activation_error_code: null,
    can_edit: false,
    can_submit: false,
    can_withdraw: true,
    can_abandon_failed_activation: false,
    can_retry_abandonment_cleanup: false,
    can_archive: true,
    can_restore: false,
    submitted_snapshot_schema_version: 1,
    submitted_snapshot_json: { title: "Submitted title" },
    submitted_images: [
      { productDraftImageId: uuid(101), position: 0, isCover: true },
      { productDraftImageId: uuid(102), position: 1, isCover: false },
    ],
    ...overrides,
  };
}

function delivery(imageId: string, status: "available" | "missing") {
  return {
    imageId,
    durableStatus: status === "available" ? ("available" as const) : null,
    deliveryStatus: status,
    deliveryErrorCode: null,
    url: status === "available" ? `https://signed.test/${imageId}` : null,
    expiresAt: status === "available" ? "2026-08-16T10:05:00.000Z" : null,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
