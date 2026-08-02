import { describe, expect, it, vi } from "vitest";

import type {
  AdminProductDraftIndexDetails,
  AdminProductDraftIndexProductRecord,
  AdminProductDraftIndexRepository,
} from "./admin-product-draft-index.repository";
import { AdminProductDraftIndexRepositoryError } from "./admin-product-draft-index.repository";
import { AdminProductDraftIndexService } from "./admin-product-draft-index.service";
import {
  ProductDraftImageDeliveryRequestError,
  type ConfirmedPrototypeAdministratorContext,
  type ProductDraftImageDeliveryInput,
  type ProductDraftImageDeliveryResponse,
} from "./product-draft-image-delivery.types";

const authorization: ConfirmedPrototypeAdministratorContext = {
  userId: uuid(900),
  prototypeAdministrator: true,
};

class MemoryRepository implements AdminProductDraftIndexRepository {
  readonly listProducts = vi.fn(async () => this.products);
  readonly loadDetails = vi.fn(async () => this.details);

  constructor(
    readonly products: AdminProductDraftIndexProductRecord[],
    readonly details: AdminProductDraftIndexDetails,
  ) {}
}

describe("AdminProductDraftIndexService", () => {
  it("builds one stable page with cover and first-image previews", async () => {
    const first = product(1, { title: "", cover_image_id: uuid(101) });
    const second = product(2, { seller_id: uuid(11) });
    const extra = product(3);
    const repository = new MemoryRepository(
      [first, second, extra],
      details({
        sellers: [
          { id: uuid(10), name: "First Seller", slug: "first-seller" },
          { id: uuid(11), name: "Second Seller", slug: "second-seller" },
        ],
        images: [
          { id: uuid(102), product_draft_id: first.id, source_position: 0 },
          { id: uuid(101), product_draft_id: first.id, source_position: 1 },
          { id: uuid(201), product_draft_id: second.id, source_position: 2 },
        ],
        facts: [{ product_draft_id: first.id, facts_revision: 4 }],
        sources: [
          source(first.id),
          source(first.id),
          source(second.id, { classifier_group_id: uuid(703) }),
        ],
      }),
    );
    const resolve = vi.fn(async (): Promise<ProductDraftImageDeliveryResponse> => ({
      entries: [
        {
          productDraftId: first.id,
          images: [delivery(uuid(101), "unavailable", "private_object_missing")],
        },
        {
          productDraftId: second.id,
          images: [delivery(uuid(201), "available")],
        },
      ],
    }));
    const service = new AdminProductDraftIndexService(repository, { resolve });
    const request = { limit: 2, cursor: null, status: null, sellerId: null };

    const page = await service.list(request, authorization);

    expect(repository.listProducts).toHaveBeenCalledWith({
      limit: 3,
      status: null,
      sellerId: null,
      before: null,
    });
    expect(repository.loadDetails).toHaveBeenCalledWith([first, second]);
    expect(resolve).toHaveBeenCalledWith(
      [
        { productDraftId: first.id, imageIds: [uuid(101)] },
        { productDraftId: second.id, imageIds: [uuid(201)] },
      ],
      authorization,
    );
    expect(page.items[0]).toMatchObject({
      productDraftId: first.id,
      title: "",
      seller: { name: "First Seller" },
      category: { slug: "trousers" },
      factsRevision: 4,
      coverImageId: uuid(101),
      previewImageId: uuid(101),
      preview: {
        deliveryStatus: "unavailable",
        deliveryErrorCode: "private_object_missing",
        url: null,
      },
      source: {
        classifierOrganizationId: uuid(700),
        classifierBatchId: uuid(701),
        classifierGroupId: uuid(702),
      },
    });
    expect(page.items[1]).toMatchObject({
      productDraftId: second.id,
      category: { slug: "trousers" },
      factsRevision: null,
      coverImageId: null,
      previewImageId: uuid(201),
      preview: { deliveryStatus: "available" },
    });
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it("does not call image delivery when the page has no image rows", async () => {
    const draft = product(1);
    const repository = new MemoryRepository([draft], details());
    const resolve = vi.fn();
    const service = new AdminProductDraftIndexService(repository, { resolve });

    const page = await service.list(
      { limit: 25, cursor: null, status: null, sellerId: null },
      authorization,
    );

    expect(resolve).not.toHaveBeenCalled();
    expect(page.items[0]?.preview).toEqual({
      deliveryStatus: "missing",
      deliveryErrorCode: null,
      url: null,
      expiresAt: null,
    });
  });

  it("rejects conflicting immutable classifier source memberships", async () => {
    const draft = product(1);
    const repository = new MemoryRepository(
      [draft],
      details({
        sources: [source(draft.id), source(draft.id, { classifier_batch_id: uuid(999) })],
      }),
    );
    const service = new AdminProductDraftIndexService(repository, { resolve: vi.fn() });

    await expect(
      service.list({ limit: 25, cursor: null, status: null, sellerId: null }, authorization),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "product_draft_source_inconsistent",
    });
  });

  it("maps repository failures without hiding delivery-domain failures", async () => {
    const repository = new MemoryRepository([], details());
    repository.listProducts.mockRejectedValue(
      new AdminProductDraftIndexRepositoryError("database unavailable"),
    );
    const service = new AdminProductDraftIndexService(repository, { resolve: vi.fn() });

    await expect(
      service.list({ limit: 25, cursor: null, status: null, sellerId: null }, authorization),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "admin_product_drafts_unavailable",
    });
  });

  it("maps a malformed stored product code to the existing unavailable boundary", async () => {
    const draft = product(1, { product_code: "private-malformed-value" });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository = new MemoryRepository([draft], details());
    const service = new AdminProductDraftIndexService(repository, { resolve: vi.fn() });

    await expect(
      service.list({ limit: 25, cursor: null, status: null, sellerId: null }, authorization),
    ).rejects.toMatchObject({ code: "admin_product_drafts_unavailable" });
    expect(log).toHaveBeenCalledWith("[Admin ProductDraft index] Stored product code is invalid.", {
      exceptionClass: "StoredProductCodeError",
      productId: draft.id,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(draft.product_code);
    expect(repository.loadDetails).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("preserves a complete image-delivery service failure", async () => {
    const draft = product(1, { cover_image_id: uuid(101) });
    const repository = new MemoryRepository([draft], details());
    const deliveryFailure = new ProductDraftImageDeliveryRequestError(
      500,
      "product_draft_image_delivery_unavailable",
      "Private image delivery is unavailable.",
    );
    const service = new AdminProductDraftIndexService(repository, {
      resolve: vi.fn().mockRejectedValue(deliveryFailure),
    });

    await expect(
      service.list({ limit: 25, cursor: null, status: null, sellerId: null }, authorization),
    ).rejects.toBe(deliveryFailure);
  });

  it("resolves 100 preview candidates through one bulk delivery invocation", async () => {
    const products = Array.from({ length: 100 }, (_, index) => product(index + 1));
    const repository = new MemoryRepository(
      products,
      details({
        images: products.map((draft, index) => ({
          id: uuid(index + 1000),
          product_draft_id: draft.id,
          source_position: 0,
        })),
      }),
    );
    const resolve = vi.fn(
      async (
        entries: ProductDraftImageDeliveryInput,
      ): Promise<ProductDraftImageDeliveryResponse> => ({
        entries: entries.map((entry) => ({
          productDraftId: entry.productDraftId,
          images: [delivery(entry.imageIds[0]!, "available")],
        })),
      }),
    );
    const service = new AdminProductDraftIndexService(repository, { resolve });

    const page = await service.list(
      { limit: 100, cursor: null, status: null, sellerId: null },
      authorization,
    );

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0]?.[0]).toHaveLength(100);
    expect(page.items).toHaveLength(100);
  });
});

function product(
  value: number,
  overrides: Partial<AdminProductDraftIndexProductRecord> = {},
): AdminProductDraftIndexProductRecord {
  return {
    id: uuid(value),
    product_code: "SEL-F-TSH-ABCDEFGH",
    title: `Draft ${value}`,
    status: "draft",
    seller_id: uuid(10),
    category_id: uuid(20),
    cover_image_id: null,
    created_at: `2026-07-24T12:00:${String(59 - (value % 59)).padStart(2, "0")}.000Z`,
    updated_at: "2026-07-24T13:00:00.000Z",
    ...overrides,
  };
}

function details(
  overrides: Partial<AdminProductDraftIndexDetails> = {},
): AdminProductDraftIndexDetails {
  return {
    sellers: [{ id: uuid(10), name: "First Seller", slug: "first-seller" }],
    categories: [{ id: uuid(20), name: "Trousers", slug: "trousers" }],
    facts: [],
    sources: [],
    images: [],
    ...overrides,
  };
}

function source(
  productDraftId: string,
  overrides: Partial<AdminProductDraftIndexDetails["sources"][number]> = {},
) {
  return {
    product_draft_id: productDraftId,
    classifier_organization_id: uuid(700),
    classifier_batch_id: uuid(701),
    classifier_group_id: uuid(702),
    ...overrides,
  };
}

function delivery(
  imageId: string,
  status: "available" | "unavailable",
  errorCode: "private_object_missing" | null = null,
) {
  return {
    imageId,
    durableStatus: "available" as const,
    deliveryStatus: status,
    deliveryErrorCode: errorCode,
    url: status === "available" ? `https://signed.test/${imageId}` : null,
    expiresAt: status === "available" ? "2026-07-24T12:05:00.000Z" : null,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
