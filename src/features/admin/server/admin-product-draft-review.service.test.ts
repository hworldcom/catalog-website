import { describe, expect, it, vi } from "vitest";

import type {
  AdminProductDraftReviewData,
  AdminProductDraftReviewRepository,
} from "./admin-product-draft-review.repository";
import { AdminProductDraftReviewRepositoryError } from "./admin-product-draft-review.repository";
import { AdminProductDraftReviewService } from "./admin-product-draft-review.service";
import {
  ProductDraftImageDeliveryRequestError,
  type ConfirmedPrototypeAdministratorContext,
  type ProductDraftImageDeliveryResponse,
} from "./product-draft-image-delivery.types";

const authorization: ConfirmedPrototypeAdministratorContext = {
  userId: uuid(900),
  prototypeAdministrator: true,
};

class MemoryRepository implements AdminProductDraftReviewRepository {
  readonly load = vi.fn(async () => this.data);

  constructor(readonly data: AdminProductDraftReviewData | null) {}
}

describe("AdminProductDraftReviewService", () => {
  it("builds durable context and resolves the ordered gallery once", async () => {
    const data = reviewData({
      product: { ...reviewData().product, title: "", cover_image_id: uuid(102) },
      sources: [source(), source()],
      images: [
        image(102, { source_position: 1, status: "available" }),
        image(101, { source_position: 0, status: "pending" }),
        image(103, { source_position: 2, status: "failed" }),
      ],
    });
    const resolve = vi.fn(async (): Promise<ProductDraftImageDeliveryResponse> => ({
      entries: [
        {
          productDraftId: data.product.id,
          images: [delivery(101, "pending"), delivery(102, "available"), delivery(103, "missing")],
        },
      ],
    }));
    const service = new AdminProductDraftReviewService(new MemoryRepository(data), { resolve });

    const review = await service.get({ productDraftId: data.product.id }, authorization);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(
      [{ productDraftId: data.product.id, imageIds: [uuid(101), uuid(102), uuid(103)] }],
      authorization,
    );
    expect(review).toMatchObject({
      productDraftId: data.product.id,
      title: "",
      titleSource: "human",
      seller: { name: "Seller" },
      category: { slug: "trousers" },
      source: {
        classifierOrganizationId: uuid(700),
        classifierBatchId: uuid(701),
        classifierGroupId: uuid(702),
      },
      coverImageId: uuid(102),
      previewImageId: uuid(102),
      previewDeliveryStatus: "available",
      previewDeliveryErrorCode: null,
    });
    expect(review.images).toEqual([
      {
        imageId: uuid(101),
        sourcePosition: 0,
        status: "pending",
        deliveryStatus: "pending",
        deliveryErrorCode: null,
        isCover: false,
        url: null,
        expiresAt: null,
      },
      {
        imageId: uuid(102),
        sourcePosition: 1,
        status: "available",
        deliveryStatus: "available",
        deliveryErrorCode: null,
        isCover: true,
        url: `https://signed.test/${uuid(102)}`,
        expiresAt: "2026-07-24T12:05:00.000Z",
      },
      {
        imageId: uuid(103),
        sourcePosition: 2,
        status: "failed",
        deliveryStatus: "missing",
        deliveryErrorCode: null,
        isCover: false,
        url: null,
        expiresAt: null,
      },
    ]);
  });

  it("uses a first-image preview and skips delivery for an empty gallery", async () => {
    const empty = reviewData({
      sources: [],
      images: [],
    });
    const emptyResolve = vi.fn();
    const emptyReview = await new AdminProductDraftReviewService(new MemoryRepository(empty), {
      resolve: emptyResolve,
    }).get({ productDraftId: empty.product.id }, authorization);

    expect(emptyResolve).not.toHaveBeenCalled();
    expect(emptyReview).toMatchObject({
      category: { slug: "trousers" },
      source: null,
      coverImageId: null,
      previewImageId: null,
      previewDeliveryStatus: "missing",
      previewDeliveryErrorCode: null,
      images: [],
    });

    const first = reviewData({ images: [image(101)] });
    const firstReview = await new AdminProductDraftReviewService(new MemoryRepository(first), {
      resolve: vi.fn(async () => ({
        entries: [
          {
            productDraftId: first.product.id,
            images: [delivery(101, "unavailable", "private_object_missing")],
          },
        ],
      })),
    }).get({ productDraftId: first.product.id }, authorization);
    expect(firstReview).toMatchObject({
      coverImageId: null,
      previewImageId: uuid(101),
      previewDeliveryStatus: "unavailable",
      previewDeliveryErrorCode: "private_object_missing",
    });
  });

  it("returns not found and rejects conflicting immutable source memberships", async () => {
    await expect(
      new AdminProductDraftReviewService(new MemoryRepository(null), {
        resolve: vi.fn(),
      }).get({ productDraftId: uuid(1) }, authorization),
    ).rejects.toMatchObject({ statusCode: 404, code: "product_draft_not_found" });

    const inconsistent = reviewData({
      sources: [source(), source({ classifier_batch_id: uuid(999) })],
    });
    await expect(
      new AdminProductDraftReviewService(new MemoryRepository(inconsistent), {
        resolve: vi.fn(),
      }).get({ productDraftId: inconsistent.product.id }, authorization),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "product_draft_source_inconsistent",
    });
  });

  it("maps database and malformed read-model failures", async () => {
    const repository = new MemoryRepository(reviewData());
    repository.load.mockRejectedValue(new AdminProductDraftReviewRepositoryError("database"));
    await expect(
      new AdminProductDraftReviewService(repository, {
        resolve: vi.fn(),
      }).get({ productDraftId: uuid(1) }, authorization),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "admin_product_draft_review_unavailable",
    });

    const missingSeller = reviewData({ seller: null });
    await expect(
      new AdminProductDraftReviewService(new MemoryRepository(missingSeller), {
        resolve: vi.fn(),
      }).get({ productDraftId: missingSeller.product.id }, authorization),
    ).rejects.toMatchObject({ code: "admin_product_draft_review_unavailable" });
  });

  it("maps a malformed stored product code to the existing unavailable boundary", async () => {
    const data = reviewData({
      product: { ...reviewData().product, product_code: "private-malformed-value" },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      new AdminProductDraftReviewService(new MemoryRepository(data), { resolve: vi.fn() }).get(
        { productDraftId: data.product.id },
        authorization,
      ),
    ).rejects.toMatchObject({ code: "admin_product_draft_review_unavailable" });
    expect(log).toHaveBeenCalledWith(
      "[Admin ProductDraft review] Stored product code is invalid.",
      { exceptionClass: "StoredProductCodeError", productId: data.product.id },
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(data.product.product_code);
    log.mockRestore();
  });

  it("preserves a total image-delivery service failure", async () => {
    const data = reviewData({ images: [image(101)] });
    const failure = new ProductDraftImageDeliveryRequestError(
      500,
      "product_draft_image_delivery_unavailable",
      "delivery unavailable",
    );
    const service = new AdminProductDraftReviewService(new MemoryRepository(data), {
      resolve: vi.fn().mockRejectedValue(failure),
    });

    await expect(service.get({ productDraftId: data.product.id }, authorization)).rejects.toBe(
      failure,
    );
  });
});

function reviewData(
  overrides: Partial<AdminProductDraftReviewData> = {},
): AdminProductDraftReviewData {
  return {
    product: {
      id: uuid(1),
      product_code: "SEL-F-TSH-ABCDEFGH",
      title: "Draft",
      title_source: "human",
      status: "draft",
      seller_id: uuid(10),
      category_id: uuid(20),
      cover_image_id: null,
      created_at: "2026-07-24T12:00:00.000Z",
      updated_at: "2026-07-24T13:00:00.000Z",
    },
    seller: { id: uuid(10), name: "Seller", slug: "seller" },
    category: { id: uuid(20), name: "Trousers", slug: "trousers" },
    sources: [],
    images: [],
    ...overrides,
  };
}

function source(
  overrides: Partial<AdminProductDraftReviewData["sources"][number]> = {},
): AdminProductDraftReviewData["sources"][number] {
  return {
    product_draft_id: uuid(1),
    classifier_organization_id: uuid(700),
    classifier_batch_id: uuid(701),
    classifier_group_id: uuid(702),
    ...overrides,
  };
}

function image(
  value: number,
  overrides: Partial<AdminProductDraftReviewData["images"][number]> = {},
): AdminProductDraftReviewData["images"][number] {
  return {
    id: uuid(value),
    product_draft_id: uuid(1),
    source_position: value,
    status: "available",
    ...overrides,
  };
}

function delivery(
  value: number,
  deliveryStatus: "available" | "pending" | "missing" | "unavailable",
  deliveryErrorCode: "private_object_missing" | null = null,
) {
  return {
    imageId: uuid(value),
    durableStatus:
      deliveryStatus === "missing"
        ? null
        : deliveryStatus === "pending"
          ? ("pending" as const)
          : ("available" as const),
    deliveryStatus,
    deliveryErrorCode,
    url: deliveryStatus === "available" ? `https://signed.test/${uuid(value)}` : null,
    expiresAt: deliveryStatus === "available" ? "2026-07-24T12:05:00.000Z" : null,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
