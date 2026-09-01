import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseUatMarketplaceFixtureGateway } from "./supabase-uat-marketplace-fixtures.gateway";

const administratorUserId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const sellerUserId = "12345678-abcd-4abc-8def-123456789abc";

function createGateway(database: object = {}) {
  return new SupabaseUatMarketplaceFixtureGateway(
    database as never,
    vi.fn() as never,
    "https://example.supabase.co",
    "service-role-key",
    administratorUserId,
    [administratorUserId],
  );
}

describe("SupabaseUatMarketplaceFixtureGateway", () => {
  it("plans deletion of every authentication user except allowlisted administrators", async () => {
    const gateway = createGateway();
    const countBusinessRows = vi.fn().mockResolvedValue(17);
    Object.assign(gateway as object, {
      listAuthUsers: vi
        .fn()
        .mockResolvedValue([
          { id: sellerUserId },
          { id: administratorUserId },
        ] satisfies Partial<User>[]),
      listStorageObjectKeys: vi.fn(async (bucket: string) => [`${bucket}/fixture.jpg`]),
      countBusinessRows,
    });

    const plan = await gateway.planReset([administratorUserId.toUpperCase()]);

    expect(plan.authUserIds).toEqual([sellerUserId]);
    expect(plan.preservedAdministratorUserIds).toEqual([administratorUserId]);
    expect(plan.databaseRows).toBe(17);
    expect(countBusinessRows).toHaveBeenCalledWith([administratorUserId]);
    expect(Object.values(plan.storageObjectKeys)).toHaveLength(3);
  });

  it("refuses an unmarked non-administrator user before seed mutation", async () => {
    const gateway = createGateway();
    Object.assign(gateway as object, {
      requireReferenceData: vi.fn().mockResolvedValue(undefined),
      listAllSellers: vi.fn().mockResolvedValue([]),
      listAuthUsers: vi.fn().mockResolvedValue([
        { id: administratorUserId, app_metadata: {} },
        { id: sellerUserId, app_metadata: {} },
      ] satisfies Partial<User>[]),
    });

    await expect(gateway.preflightSeed(new Map())).rejects.toThrow(
      "uat_marketplace_fixture_conflict",
    );
  });

  it("maps read-model failures to the stable verification error", async () => {
    const order = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "seller read failed" },
    });
    const database = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ order })) })),
    };
    const gateway = createGateway(database);

    await expect(gateway.verify(new Map())).rejects.toThrow(
      "uat_marketplace_fixture_verification_failed",
    );
  });
});
