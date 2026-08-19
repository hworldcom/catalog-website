import { describe, expect, it, vi } from "vitest";

import type { ProductModerationSnapshot } from "@/features/seller/product-moderation-snapshot.types";
import type { Json } from "@/lib/supabase/types";

import { decodeAdministratorModerationCursor } from "../administrator-moderation.cursor";
import { AdministratorModerationService } from "./administrator-moderation.service";
import {
  AdministratorModerationRepositoryError,
  type AdministratorModerationQueueRecord,
  type AdministratorModerationRepository,
  type AdministratorProductModerationDetailRecord,
  type AdministratorSellerModerationDetailRecord,
} from "./administrator-moderation.repository";

const authorization = {
  userId: uuid(1),
  prototypeAdministrator: true as const,
};

describe("AdministratorModerationService", () => {
  it("composes one mixed page, private previews, and a filter-bound cursor", async () => {
    const product = productQueueRecord();
    const seller = sellerQueueRecord();
    const moderationRepository = repository({
      list: vi.fn(async () => [seller, product, sellerQueueRecord({ submission_id: uuid(99) })]),
    });
    const delivery = imageDelivery();
    const service = new AdministratorModerationService(moderationRepository, delivery);
    const request = {
      submissionType: null,
      reviewStatus: "pending" as const,
      activationStatus: null,
      sellerId: null,
      limit: 2,
      cursor: null,
    };

    const page = await service.list(request, authorization);

    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      submissionType: "new_seller",
      preview: {
        kind: "seller_logo",
        deliveryStatus: "available",
        url: `/v1/seller-profile-assets/${seller.seller_preview_asset_id}`,
        expiresAt: null,
      },
    });
    expect(page.items[1]).toMatchObject({
      submissionType: "initial_product",
      product: { title: "Black dress" },
      preview: { kind: "product_cover", deliveryStatus: "available" },
    });
    expect(delivery.resolve).toHaveBeenCalledWith(
      [{ productDraftId: product.product_id, imageIds: [product.product_cover_image_id] }],
      authorization,
    );
    expect(page.nextCursor).not.toBeNull();
    expect(
      decodeAdministratorModerationCursor(page.nextCursor!, page.normalizedFilters),
    ).toMatchObject({
      submittedAt: product.submitted_at,
      submissionType: product.submission_type,
      submissionId: product.submission_id,
    });
  });

  it("groups repeated product rows into one delivery request and never uses seller branding", async () => {
    const first = productQueueRecord();
    const second = productQueueRecord({
      submission_id: uuid(21),
      product_cover_image_id: uuid(22),
      product_snapshot_json: productSnapshot({ coverImageId: uuid(22), imageIds: [uuid(22)] }),
    });
    const delivery = imageDelivery();
    const service = new AdministratorModerationService(
      repository({ list: vi.fn(async () => [first, second]) }),
      delivery,
    );

    const page = await service.list(
      {
        submissionType: null,
        reviewStatus: "pending",
        activationStatus: null,
        sellerId: null,
        limit: 25,
        cursor: null,
      },
      authorization,
    );

    expect(delivery.resolve).toHaveBeenCalledWith(
      [
        {
          productDraftId: first.product_id,
          imageIds: [first.product_cover_image_id, second.product_cover_image_id],
        },
      ],
      authorization,
    );
    expect(page.items.every((item) => item.preview.kind === "product_cover")).toBe(true);
  });

  it("returns no product preview when the immutable submission has no cover", async () => {
    const delivery = imageDelivery();
    const service = new AdministratorModerationService(
      repository({
        list: vi.fn(async () => [
          productQueueRecord({
            product_cover_image_id: null,
            product_snapshot_json: productSnapshot({ coverImageId: null, imageIds: [] }),
          }),
        ]),
      }),
      delivery,
    );

    const page = await service.list(defaultRequest(), authorization);

    expect(page.items[0]?.preview).toEqual({
      kind: "none",
      deliveryStatus: "missing",
      deliveryErrorCode: null,
      url: null,
      expiresAt: null,
    });
    expect(delivery.resolve).not.toHaveBeenCalled();
  });

  it("returns a strict seller update detail with immutable baseline comparison", async () => {
    const record = sellerDetailRecord();
    const service = new AdministratorModerationService(
      repository({ getSeller: vi.fn(async () => record) }),
      imageDelivery(),
    );

    const detail = await service.getSeller(record.submissionId);

    expect(detail).toMatchObject({
      kind: "seller",
      request: {
        submissionType: "seller_update",
        preview: { kind: "seller_logo", expiresAt: null },
      },
      comparisonBaseline: { submissionId: uuid(32), revision: 1 },
      changedFields: ["name", "logo"],
      actions: { canDecide: true },
    });
    expect(detail.decision).toBeNull();
  });

  it("compares only normalized seller-visible product values", async () => {
    const record = productDetailRecord();
    const delivery = imageDelivery();
    const service = new AdministratorModerationService(
      repository({ getProduct: vi.fn(async () => record) }),
      delivery,
    );

    const detail = await service.getProduct(record.submissionId, authorization);

    expect(detail.changedFields).toEqual(["price"]);
    expect(detail.comparisonBaseline?.images).toHaveLength(1);
    expect(delivery.resolve).toHaveBeenCalledTimes(1);
    expect(delivery.resolve).toHaveBeenCalledWith(
      [{ productDraftId: record.productId, imageIds: [uuid(42)] }],
      authorization,
    );
  });

  it("chunks a gallery larger than the delivery operation limit", async () => {
    const imageIds = Array.from({ length: 101 }, (_, index) => uuid(1000 + index));
    const images = imageIds.map((productDraftImageId, position) => ({
      productDraftImageId,
      position,
      isCover: position === 0,
    }));
    const record = productDetailRecord({
      submissionKind: "initial_publication",
      revision: 1,
      proposed: {
        snapshotSchemaVersion: 1,
        snapshot: productSnapshot({ imageIds, coverImageId: imageIds[0] }),
        images,
      },
      comparisonBaseline: null,
    });
    const delivery = imageDelivery();
    const service = new AdministratorModerationService(
      repository({ getProduct: vi.fn(async () => record) }),
      delivery,
    );

    const detail = await service.getProduct(record.submissionId, authorization);

    expect(detail.proposed.images).toHaveLength(101);
    expect(delivery.resolve).toHaveBeenCalledTimes(2);
    expect(delivery.resolve.mock.calls[0]?.[0][0]?.imageIds).toHaveLength(100);
    expect(delivery.resolve.mock.calls[1]?.[0][0]?.imageIds).toHaveLength(1);
  });

  it("rejects approved submissions without activation and malformed durable snapshots", async () => {
    const approved = productQueueRecord({ review_status: "approved" });
    const malformedSeller = sellerDetailRecord({
      proposed: {
        ...sellerDetailRecord().proposed,
        snapshot: { ...sellerSnapshot(), unexpected: true },
      },
    });
    const service = new AdministratorModerationService(
      repository({
        list: vi.fn(async () => [approved]),
        getSeller: vi.fn(async () => malformedSeller),
      }),
      imageDelivery(),
    );

    await expect(service.list(defaultRequest(), authorization)).rejects.toMatchObject({
      statusCode: 503,
      code: "moderation_unavailable",
    });
    await expect(service.getSeller(malformedSeller.submissionId)).rejects.toMatchObject({
      statusCode: 503,
      code: "moderation_unavailable",
    });
  });

  it("maps database failures to the stable unavailable error", async () => {
    const service = new AdministratorModerationService(
      repository({
        list: vi.fn(async () => {
          throw new AdministratorModerationRepositoryError("database unavailable");
        }),
      }),
      imageDelivery(),
      { error: vi.fn() },
    );

    await expect(service.list(defaultRequest(), authorization)).rejects.toMatchObject({
      statusCode: 503,
      code: "moderation_unavailable",
    });
  });
});

function repository(
  overrides: Partial<AdministratorModerationRepository> = {},
): AdministratorModerationRepository {
  return {
    list: vi.fn(async () => []),
    getSeller: vi.fn(async () => null),
    getProduct: vi.fn(async () => null),
    ...overrides,
  };
}

function imageDelivery() {
  return {
    resolve: vi.fn(async (entries: Array<{ productDraftId: string; imageIds: string[] }>) => ({
      entries: entries.map((entry) => ({
        productDraftId: entry.productDraftId,
        images: entry.imageIds.map((imageId) => ({
          imageId,
          durableStatus: "available" as const,
          deliveryStatus: "available" as const,
          deliveryErrorCode: null,
          url: `https://images.example/${imageId}`,
          expiresAt: "2026-08-18T10:05:00.000Z",
        })),
      })),
    })),
  };
}

function defaultRequest() {
  return {
    submissionType: null,
    reviewStatus: "pending" as const,
    activationStatus: null,
    sellerId: null,
    limit: 25,
    cursor: null,
  };
}

function sellerQueueRecord(
  overrides: Partial<AdministratorModerationQueueRecord> = {},
): AdministratorModerationQueueRecord {
  return {
    submission_type: "new_seller",
    submission_id: uuid(10),
    seller_id: uuid(11),
    seller_name: "New seller",
    revision: 1,
    submitted_at: "2026-08-18T09:00:00.000Z",
    review_status: "pending",
    seller_visible_reason: null,
    seller_preview_kind: "seller_logo",
    seller_preview_asset_id: uuid(12),
    seller_preview_durable_status: "available",
    seller_preview_error_code: null,
    product_id: null,
    product_snapshot_schema_version: null,
    product_snapshot_json: null,
    product_cover_image_id: null,
    activation_run_id: null,
    activation_phase: null,
    activation_status: null,
    activation_dispatch_status: null,
    activation_dispatch_generation: null,
    activation_dispatch_error_code: null,
    activation_error_code: null,
    ...overrides,
  };
}

function productQueueRecord(
  overrides: Partial<AdministratorModerationQueueRecord> = {},
): AdministratorModerationQueueRecord {
  return {
    submission_type: "initial_product",
    submission_id: uuid(20),
    seller_id: uuid(11),
    seller_name: "Approved seller",
    revision: 1,
    submitted_at: "2026-08-18T09:30:00.000Z",
    review_status: "pending",
    seller_visible_reason: null,
    seller_preview_kind: null,
    seller_preview_asset_id: null,
    seller_preview_durable_status: null,
    seller_preview_error_code: null,
    product_id: uuid(40),
    product_snapshot_schema_version: 1,
    product_snapshot_json: productSnapshot(),
    product_cover_image_id: uuid(42),
    activation_run_id: null,
    activation_phase: null,
    activation_status: null,
    activation_dispatch_status: null,
    activation_dispatch_generation: null,
    activation_dispatch_error_code: null,
    activation_error_code: null,
    ...overrides,
  };
}

function sellerDetailRecord(
  overrides: Partial<AdministratorSellerModerationDetailRecord> = {},
): AdministratorSellerModerationDetailRecord {
  const proposed = sellerSnapshot({
    revision: 2,
    submissionKind: "update",
    name: "Updated seller",
    logoAssetId: uuid(35),
  });
  return {
    submissionId: uuid(31),
    sellerId: proposed.sellerId,
    sellerName: proposed.name,
    revision: 2,
    submittedAt: "2026-08-18T10:00:00.000Z",
    reviewStatus: "pending",
    sellerVisibleReason: null,
    administratorUserId: null,
    decisionRequestId: null,
    decidedAt: null,
    proposed: {
      snapshot: proposed,
      logoAsset: {
        assetId: uuid(35),
        kind: "logo",
        durableStatus: "available",
        errorCode: null,
      },
      coverAsset: null,
    },
    comparisonBaseline: {
      submissionId: uuid(32),
      revision: 1,
      snapshot: sellerSnapshot(),
      logoAsset: null,
      coverAsset: null,
    },
    currentApprovedReference: { submissionId: uuid(32), revision: 1 },
    canDecide: true,
    ...overrides,
  };
}

function productDetailRecord(
  overrides: Partial<AdministratorProductModerationDetailRecord> = {},
): AdministratorProductModerationDetailRecord {
  const proposed = productSnapshot({
    audiences: ["women", "men"],
    price: 11,
    descriptions: [description("human", "2026-08-18T10:00:00.000Z")],
    facts: { factsRevision: 2, facts: { colors: ["black"], schemaVersion: 2 } },
  });
  const baseline = productSnapshot({
    audiences: ["men", "women"],
    price: 10,
    descriptions: [description("model", "2026-08-17T10:00:00.000Z")],
    facts: { factsRevision: 1, facts: { schemaVersion: 2, colors: ["black"] } },
  });
  return {
    submissionId: uuid(41),
    productId: uuid(40),
    sellerId: uuid(11),
    sellerName: "Approved seller",
    revision: 2,
    submissionKind: "update",
    submittedAt: "2026-08-18T10:30:00.000Z",
    reviewStatus: "pending",
    sellerVisibleReason: null,
    administratorUserId: null,
    decisionRequestId: null,
    decidedAt: null,
    proposed: {
      snapshotSchemaVersion: 1,
      snapshot: proposed,
      images: [{ productDraftImageId: uuid(42), position: 0, isCover: true }],
    },
    comparisonBaseline: {
      submissionId: uuid(43),
      revision: 1,
      snapshotSchemaVersion: 1,
      snapshot: baseline,
      images: [{ productDraftImageId: uuid(42), position: 0, isCover: true }],
    },
    currentApprovedReference: { submissionId: uuid(43), revision: 1 },
    activation: null,
    canDecide: true,
    canRetryDispatch: false,
    canRetryActivation: false,
    canRetryPostSwitchCleanup: false,
    ...overrides,
  };
}

function sellerSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    sellerId: uuid(33),
    revision: 1,
    submissionKind: "initial",
    name: "Original seller",
    slug: "original-seller",
    city: null,
    country: null,
    whatsapp: null,
    email: null,
    about: null,
    logoAssetId: null,
    coverAssetId: null,
    establishedYear: null,
    ...overrides,
  };
}

function productSnapshot(overrides: Partial<ProductModerationSnapshot> = {}): Json {
  return {
    schemaVersion: 1,
    productId: uuid(40),
    sellerId: uuid(11),
    productCode: "SEL-F-0001",
    productCodeInput: null,
    title: "Black dress",
    titleSource: "human",
    categoryId: uuid(44),
    audiences: ["women"],
    descriptions: [],
    facts: null,
    minimumOrder: null,
    packSize: null,
    price: 10,
    currency: "EUR",
    stock: "in_stock",
    imageIds: [uuid(42)],
    coverImageId: uuid(42),
    ...overrides,
  } as Json;
}

function description(source: "human" | "model", generatedAt: string) {
  return {
    language: "en" as const,
    descriptionText: "A black dress.",
    source,
    factsRevision: 1,
    provider: source === "model" ? "openai" : null,
    model: source === "model" ? "test-model" : null,
    pipelineVersion: source === "model" ? "v1" : null,
    generatedAt,
    updatedAt: generatedAt,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
