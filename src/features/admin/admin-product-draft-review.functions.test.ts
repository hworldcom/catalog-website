import { describe, expect, it, vi } from "vitest";

import { handleGetAdminProductDraftReview } from "./admin-product-draft-review.functions";
import type { AdminProductDraftReview } from "./admin-product-draft-review.types";
import type { PrototypeAdministratorRequestContext } from "./prototype-administrator.middleware";

const context = {
  userId: uuid(900),
  prototypeAdministrator: true,
} as PrototypeAdministratorRequestContext;

describe("handleGetAdminProductDraftReview", () => {
  it("checks the gate before constructing the service and applies private headers", async () => {
    const events: string[] = [];
    const response = review();
    const get = vi.fn(async () => {
      events.push("get");
      return response;
    });

    await expect(
      handleGetAdminProductDraftReview({ productDraftId: response.productDraftId }, context, {
        assertEnabled: vi.fn(async () => {
          events.push("gate");
        }),
        createService: vi.fn(async () => {
          events.push("create");
          return { get };
        }),
        applyResponseHeaders: vi.fn(() => {
          events.push("headers");
        }),
      }),
    ).resolves.toEqual(response);

    expect(events).toEqual(["gate", "create", "get", "headers"]);
    expect(get).toHaveBeenCalledWith(
      { productDraftId: response.productDraftId },
      { userId: context.userId, prototypeAdministrator: true },
    );
  });

  it("does not construct a service while the deployment gate is closed", async () => {
    const createService = vi.fn();
    await expect(
      handleGetAdminProductDraftReview({ productDraftId: uuid(1) }, context, {
        assertEnabled: vi.fn(async () => {
          throw new Error("gate closed");
        }),
        createService,
        applyResponseHeaders: vi.fn(),
      }),
    ).rejects.toThrow("gate closed");
    expect(createService).not.toHaveBeenCalled();
  });
});

function review(): AdminProductDraftReview {
  return {
    productDraftId: uuid(1),
    title: "Draft",
    titleSource: "human",
    status: "draft",
    seller: { id: uuid(10), name: "Seller", slug: "seller" },
    category: null,
    source: null,
    coverImageId: null,
    previewImageId: null,
    previewDeliveryStatus: "missing",
    previewDeliveryErrorCode: null,
    images: [],
    createdAt: "2026-07-24T12:00:00.000Z",
    updatedAt: "2026-07-24T13:00:00.000Z",
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
