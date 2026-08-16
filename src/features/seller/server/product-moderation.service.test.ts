import { describe, expect, it, vi } from "vitest";

import { ProductModerationError } from "../product-moderation.types";
import {
  ProductModerationService,
  type ProductModerationAdministrator,
  type ProductModerationRequester,
} from "./product-moderation.service";

const sellerId = uuid(1);
const userId = uuid(2);
const productId = uuid(3);
const submissionId = uuid(4);
const requestId = uuid(5);

describe("product moderation service", () => {
  it("returns the owned initial moderation state and immutable active snapshot", async () => {
    const requester = createRequester();
    const administrator = createAdministrator([
      {
        product_id: productId,
        seller_id: sellerId,
        moderation_revision: 7,
        product_status: "draft",
        seller_approved: true,
        active_submission_id: submissionId,
        active_submission_status: "pending",
        active_submission_revision: 7,
        active_submission_submitted_at: "2026-08-15T10:00:00.000Z",
        active_submission_snapshot: { title: "Cotton shirt" },
      },
    ]);

    await expect(
      service(requester.client, administrator.client).read({
        userId,
        productDraftId: productId,
      }),
    ).resolves.toMatchObject({
      moderationRevision: 7,
      sellerApproved: true,
      activeSubmission: {
        id: submissionId,
        revision: 7,
        snapshot: { title: "Cotton shirt" },
      },
    });

    expect(requester.order).toEqual(["requester"]);
    expect(administrator.order).toEqual(["administrator"]);
  });

  it("submits only after requester-scoped seller ownership is resolved", async () => {
    const requester = createRequester();
    const administrator = createAdministrator([submission()]);

    await service(requester.client, administrator.client).submit({
      userId,
      productDraftId: productId,
      expectedModerationRevision: 7,
      requestId,
    });

    expect(administrator.rpc).toHaveBeenCalledWith("submit_product_moderation", {
      p_product_id: productId,
      p_seller_id: sellerId,
      p_expected_revision: 7,
      p_seller_request_id: requestId,
      p_submitted_by_user_id: userId,
    });
  });

  it("withdraws a pending submission with the expected combined revision", async () => {
    const requester = createRequester();
    const administrator = createAdministrator([submission({ review_status: "withdrawn" })]);

    await service(requester.client, administrator.client).withdraw({
      userId,
      productDraftId: productId,
      submissionId,
      expectedModerationRevision: 7,
      requestId,
    });

    expect(administrator.rpc).toHaveBeenCalledWith("withdraw_product_moderation", {
      p_product_id: productId,
      p_seller_id: sellerId,
      p_submission_id: submissionId,
      p_expected_revision: 7,
      p_request_id: requestId,
      p_actor_user_id: userId,
    });
  });

  it("maps stable database conflicts without exposing database details", async () => {
    const requester = createRequester();
    const administrator = createAdministrator(null, {
      message: "product_moderation_working_revision_conflict",
    });

    await expect(
      service(requester.client, administrator.client).submit({
        userId,
        productDraftId: productId,
        expectedModerationRevision: 6,
        requestId,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "product_moderation_working_revision_conflict",
    } satisfies Partial<ProductModerationError>);
  });
});

function service(
  requester: ProductModerationRequester,
  administrator: ProductModerationAdministrator,
) {
  return new ProductModerationService(requester, administrator);
}

function createRequester() {
  const order: string[] = [];
  const maybeSingle = vi.fn(async () => {
    order.push("requester");
    return { data: { id: sellerId }, error: null };
  });
  return {
    client: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      })),
    } as unknown as ProductModerationRequester,
    order,
  };
}

function createAdministrator(data: unknown, error: { message: string } | null = null) {
  const order: string[] = [];
  const rpc = vi.fn(async () => {
    order.push("administrator");
    return { data, error };
  });
  return {
    client: { rpc } as ProductModerationAdministrator,
    order,
    rpc,
  };
}

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: submissionId,
    product_id: productId,
    seller_id: sellerId,
    submission_kind: "initial_publication",
    revision: 7,
    snapshot_schema_version: 1,
    snapshot_json: { title: "Cotton shirt" },
    review_status: "pending",
    seller_request_id: requestId,
    submitted_by_user_id: userId,
    submitted_at: "2026-08-15T10:00:00.000Z",
    seller_visible_reason: null,
    decided_at: null,
    ...overrides,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
