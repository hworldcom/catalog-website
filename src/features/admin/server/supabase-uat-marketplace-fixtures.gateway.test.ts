import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { UAT_MARKETPLACE_SELLERS } from "./uat-marketplace-fixtures.manifest";
import { SupabaseUatMarketplaceFixtureGateway } from "./supabase-uat-marketplace-fixtures.gateway";

const administratorUserId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const sellerUserId = "12345678-abcd-4abc-8def-123456789abc";

function createGateway(database: object = {}, sql: object = vi.fn()) {
  return new SupabaseUatMarketplaceFixtureGateway(
    database as never,
    sql as never,
    "https://example.supabase.co",
    "service-role-key",
    administratorUserId,
    [administratorUserId],
  );
}

describe("SupabaseUatMarketplaceFixtureGateway", () => {
  it("accepts approved fixture sellers without the separate verification badge", async () => {
    const rows = [...UAT_MARKETPLACE_SELLERS]
      .sort((left, right) => left.slug.localeCompare(right.slug))
      .map((seller, index) => ({
        id: `seller-${index}`,
        owner_id: `owner-${index}`,
        slug: seller.slug,
        published: true,
        verified: false,
        storefront_enabled: true,
        approved_profile_submission_id: `submission-${index}`,
        logo_url: `/logos/${index}`,
        cover_image_url: `/covers/${index}`,
      }));
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ order }));
    const gateway = createGateway({ from: vi.fn(() => ({ select })) });

    await expect(
      (
        gateway as unknown as {
          requireFixtureSellers(): Promise<unknown>;
        }
      ).requireFixtureSellers(),
    ).resolves.toEqual(rows);

    expect(select).toHaveBeenCalledWith(expect.not.stringContaining("verified"));
  });

  it("validates audience normalization through the protected database connection", async () => {
    const remoteProcedureCall = vi.fn();
    const sql = vi.fn().mockResolvedValue([{ audiences: ["women", "men", "kids"] }]);
    const gateway = createGateway({ rpc: remoteProcedureCall }, sql);

    await expect(
      (
        gateway as unknown as {
          requireNormalizedAudiences(): Promise<void>;
        }
      ).requireNormalizedAudiences(),
    ).resolves.toBeUndefined();

    expect(remoteProcedureCall).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledOnce();
  });

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

  it("removes non-administrator roles from preserved administrators during reset", async () => {
    const queries: string[] = [];
    const transaction = Object.assign(
      vi.fn((strings: TemplateStringsArray | readonly string[]) => {
        if (!("raw" in strings)) return strings;
        queries.push(strings.join("?"));
        return Promise.resolve([]);
      }),
      { unsafe: vi.fn().mockResolvedValue([]) },
    );
    const sql = {
      begin: vi.fn(async (callback: (value: typeof transaction) => Promise<void>) => {
        await callback(transaction);
      }),
    };
    const gateway = createGateway({}, sql);
    Object.assign(gateway as object, {
      countBusinessRows: vi.fn().mockResolvedValue(0),
    });

    await (
      gateway as unknown as {
        truncateBusinessData(userIds: string[]): Promise<number>;
      }
    ).truncateBusinessData([administratorUserId]);

    expect(queries.some((query) => query.includes("role <> 'admin'::public.app_role"))).toBe(true);
    expect(queries.some((query) => query.includes("user_id NOT IN"))).toBe(true);
  });

  it("rejects extra roles on a preserved administrator after reset", async () => {
    const selectRoles = vi.fn().mockResolvedValue({
      data: [
        { user_id: administratorUserId, role: "admin" },
        { user_id: administratorUserId, role: "seller" },
      ],
      error: null,
    });
    const database = {
      from: vi.fn(() => ({ select: selectRoles })),
    };
    const gateway = createGateway(database);
    Object.assign(gateway as object, {
      countBusinessRows: vi.fn().mockResolvedValue(0),
      listStorageObjectKeys: vi.fn().mockResolvedValue([]),
      listAuthUsers: vi.fn().mockResolvedValue([{ id: administratorUserId }]),
    });

    await expect(
      (
        gateway as unknown as {
          verifyReset(userIds: string[]): Promise<void>;
        }
      ).verifyReset([administratorUserId]),
    ).rejects.toThrow("uat_marketplace_fixture_reset_failed");
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
