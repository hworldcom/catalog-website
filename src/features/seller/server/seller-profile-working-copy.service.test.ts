import { describe, expect, it, vi } from "vitest";

import {
  findOwnedSellerProfileIdentity,
  readOwnedSellerProfile,
  saveOwnedSellerProfile,
  type SellerProfileAdministrator,
  type SellerProfileRequester,
} from "./seller-profile-working-copy.service";

const sellerId = "00000000-0000-4000-8000-000000000101";

describe("seller profile working-copy service", () => {
  it("resolves the seller with the requester-scoped client before reading", async () => {
    const requester = createRequester(seller());
    const administrator = createAdministrator([workingCopy()]);

    await expect(
      readOwnedSellerProfile({
        requester: requester.client,
        administrator: administrator.client,
        userId: "user-1",
      }),
    ).resolves.toEqual({ seller: seller(), workingCopy: workingCopy() });

    expect(requester.eq).toHaveBeenCalledWith("owner_id", "user-1");
    expect(administrator.rpc).toHaveBeenCalledWith("read_seller_profile_working_copy", {
      p_seller_id: sellerId,
    });
    expect(requester.order).toEqual(["requester"]);
    expect(administrator.order).toEqual(["administrator"]);
  });

  it("never invokes the protected operation when the requester owns no seller", async () => {
    const requester = createRequester(null);
    const administrator = createAdministrator([workingCopy()]);

    await expect(
      readOwnedSellerProfile({
        requester: requester.client,
        administrator: administrator.client,
        userId: "user-2",
      }),
    ).rejects.toThrow("seller_approval_not_found");
    expect(administrator.rpc).not.toHaveBeenCalled();
  });

  it("uses the resolved seller and expected revision for scalar saves", async () => {
    const requester = createRequester(seller());
    const administrator = createAdministrator([workingCopy({ revision: 4 })]);

    const result = await saveOwnedSellerProfile({
      requester: requester.client,
      administrator: administrator.client,
      userId: "user-1",
      patch: {
        expectedRevision: 3,
        name: "Updated Seller",
        slug: "updated-seller",
        city: "Berlin",
        country: "Germany",
        whatsapp: null,
        email: "seller@example.test",
        about: "Updated profile",
        establishedYear: 2024,
        logoAssetId: "00000000-0000-4000-8000-000000000301",
        coverAssetId: "00000000-0000-4000-8000-000000000302",
      },
    });

    expect(result.workingCopy.revision).toBe(4);
    expect(administrator.rpc).toHaveBeenCalledWith("save_seller_profile_working_copy", {
      p_seller_id: sellerId,
      p_expected_revision: 3,
      p_name: "Updated Seller",
      p_slug: "updated-seller",
      p_city: "Berlin",
      p_country: "Germany",
      p_whatsapp: null,
      p_email: "seller@example.test",
      p_about: "Updated profile",
      p_established_year: 2024,
      p_logo_asset_id: "00000000-0000-4000-8000-000000000301",
      p_cover_asset_id: "00000000-0000-4000-8000-000000000302",
    });
  });

  it("preserves stable revision-conflict errors", async () => {
    const requester = createRequester(seller());
    const administrator = createAdministrator(null, {
      message: "seller_profile_revision_conflict",
    });

    await expect(
      saveOwnedSellerProfile({
        requester: requester.client,
        administrator: administrator.client,
        userId: "user-1",
        patch: {
          expectedRevision: 1,
          name: "QA Seller",
          slug: "qa-seller",
          city: null,
          country: null,
          whatsapp: null,
          email: null,
          about: null,
          establishedYear: null,
          logoAssetId: null,
          coverAssetId: null,
        },
      }),
    ).rejects.toThrow("seller_profile_revision_conflict");
  });

  it("maps unrecognized database failures to the unavailable contract", async () => {
    const requester = createRequester(seller());
    const databaseLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const administrator = createAdministrator(null, {
      code: "PGRST205",
      message: "Could not find the table in the schema cache",
    });

    await expect(
      readOwnedSellerProfile({
        requester: requester.client,
        administrator: administrator.client,
        userId: "user-1",
      }),
    ).rejects.toThrow("seller_approval_unavailable");
    expect(databaseLog).toHaveBeenCalledWith("[Seller profile] Database operation failed.", {
      databaseCode: "PGRST205",
      stableCode: "seller_approval_unavailable",
    });
    databaseLog.mockRestore();
  });

  it("returns null when the requester has no seller identity", async () => {
    const requester = createRequester(null);
    await expect(
      findOwnedSellerProfileIdentity({ requester: requester.client, userId: "user-3" }),
    ).resolves.toBeNull();
  });
});

function createRequester(data: ReturnType<typeof seller> | null) {
  const order: string[] = [];
  const maybeSingle = vi.fn(async () => {
    order.push("requester");
    return { data, error: null };
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    client: { from } as unknown as SellerProfileRequester,
    eq,
    order,
  };
}

function createAdministrator(
  data: unknown,
  error: { message: string; code?: string } | null = null,
) {
  const order: string[] = [];
  const rpc = vi.fn(async () => {
    order.push("administrator");
    return { data, error };
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
    primary_category_id: "00000000-0000-4000-8000-000000000201",
    approved_profile_submission_id: null,
    storefront_enabled: false,
    published: false,
  };
}

function workingCopy(overrides: Partial<{ revision: number }> = {}) {
  return {
    seller_id: sellerId,
    revision: 1,
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
    created_at: "2026-08-11T12:00:00.000Z",
    updated_at: "2026-08-11T12:00:00.000Z",
    ...overrides,
  };
}
