import { describe, expect, it, vi } from "vitest";

import {
  decideSellerProfileSubmission,
  setOwnedSellerStorefrontEnabled,
  submitOwnedSellerProfile,
  withdrawOwnedSellerProfileSubmission,
} from "./seller-profile-moderation.service";
import type {
  SellerProfileAdministrator,
  SellerProfileRequester,
} from "./seller-profile-working-copy.service";

const sellerId = uuid(1);
const userId = uuid(2);
const administratorId = uuid(3);
const submissionId = uuid(4);
const requestId = uuid(5);

describe("seller profile moderation service", () => {
  it("resolves seller ownership before submitting the protected working copy", async () => {
    const requester = createRequester();
    const administrator = createAdministrator([submission()]);

    await expect(
      submitOwnedSellerProfile({
        requester: requester.client,
        administrator: administrator.client,
        userId,
        expectedRevision: 4,
        requestId,
      }),
    ).resolves.toMatchObject({ submission: { id: submissionId, status: "pending" } });

    expect(requester.order).toEqual(["requester"]);
    expect(administrator.order).toEqual(["administrator"]);
    expect(administrator.rpc).toHaveBeenCalledWith("submit_seller_profile_working_copy", {
      p_seller_id: sellerId,
      p_expected_revision: 4,
      p_seller_request_id: requestId,
      p_submitted_by_user_id: userId,
    });
  });

  it("passes the immutable submission revision to withdrawal", async () => {
    const requester = createRequester();
    const administrator = createAdministrator([submission({ status: "withdrawn" })]);

    await withdrawOwnedSellerProfileSubmission({
      requester: requester.client,
      administrator: administrator.client,
      userId,
      submissionId,
      expectedRevision: 4,
      requestId,
    });

    expect(administrator.rpc).toHaveBeenCalledWith("withdraw_seller_profile_submission", {
      p_seller_id: sellerId,
      p_submission_id: submissionId,
      p_expected_revision: 4,
      p_request_id: requestId,
      p_actor_user_id: userId,
    });
  });

  it("uses the authenticated administrator as the decision actor", async () => {
    const administrator = createAdministrator([
      submission({
        status: "changes_requested",
        administrator_user_id: administratorId,
        decision_request_id: requestId,
        seller_visible_reason: "Please update the contact details.",
        decided_at: "2026-08-14T10:00:00.000Z",
      }),
    ]);

    await decideSellerProfileSubmission({
      authorization: {
        userId: administratorId,
        prototypeAdministrator: true,
      } as never,
      administrator: administrator.client,
      sellerId,
      submissionId,
      expectedRevision: 4,
      decision: "request_changes",
      reason: "Please update the contact details.",
      requestId,
    });

    expect(administrator.rpc).toHaveBeenCalledWith("decide_seller_profile_submission", {
      p_seller_id: sellerId,
      p_submission_id: submissionId,
      p_expected_revision: 4,
      p_decision: "request_changes",
      p_reason: "Please update the contact details.",
      p_decision_request_id: requestId,
      p_administrator_user_id: administratorId,
    });
  });

  it("sets storefront preference only after requester ownership resolution", async () => {
    const requester = createRequester();
    const administrator = createAdministrator([
      { ...seller(), storefront_enabled: true, published: true },
    ]);

    await expect(
      setOwnedSellerStorefrontEnabled({
        requester: requester.client,
        administrator: administrator.client,
        userId,
        enabled: true,
        requestId,
      }),
    ).resolves.toMatchObject({ seller: { storefront_enabled: true, published: true } });
  });
});

function createRequester() {
  const order: string[] = [];
  const maybeSingle = vi.fn(async () => {
    order.push("requester");
    return { data: seller(), error: null };
  });
  return {
    client: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      })),
    } as unknown as SellerProfileRequester,
    order,
  };
}

function createAdministrator(data: unknown) {
  const order: string[] = [];
  const rpc = vi.fn(async () => {
    order.push("administrator");
    return { data, error: null };
  });
  return {
    client: { rpc } as SellerProfileAdministrator,
    order,
    rpc,
  };
}

function seller() {
  return {
    id: sellerId,
    slug: "qa-seller",
    company_code: "QAS",
    company_code_locked_at: null,
    primary_category_id: uuid(7),
    approved_profile_submission_id: null,
    storefront_enabled: false,
    published: false,
  };
}

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: submissionId,
    seller_id: sellerId,
    revision: 4,
    submission_kind: "initial",
    status: "pending",
    name: "QA Seller",
    slug: "qa-seller",
    city: null,
    country: null,
    whatsapp: null,
    email: null,
    about: null,
    logo_asset_id: null,
    cover_asset_id: null,
    established_year: null,
    seller_request_id: requestId,
    submitted_by_user_id: userId,
    submitted_at: "2026-08-14T09:00:00.000Z",
    administrator_user_id: null,
    decision_request_id: null,
    seller_visible_reason: null,
    decided_at: null,
    created_at: "2026-08-14T09:00:00.000Z",
    updated_at: "2026-08-14T09:00:00.000Z",
    ...overrides,
  };
}

function uuid(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
