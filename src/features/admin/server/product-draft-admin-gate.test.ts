import { describe, expect, it, vi } from "vitest";

import {
  AdminProductDraftGateError,
  ProductDraftAdminGate,
  readAdminProductDraftsEnabled,
  type ProductDraftImageCutoverStatusReader,
} from "./product-draft-admin-gate";

describe("ProductDraftAdminGate", () => {
  it("requires the exact true environment value", () => {
    expect(readAdminProductDraftsEnabled("true")).toBe(true);
    expect(readAdminProductDraftsEnabled("TRUE")).toBe(false);
    expect(readAdminProductDraftsEnabled("1")).toBe(false);
    expect(readAdminProductDraftsEnabled(undefined)).toBe(false);
  });

  it.each(["pending", "running", "failed", null] as const)(
    "fails closed for durable state %s",
    async (status) => {
      const reader: ProductDraftImageCutoverStatusReader = {
        getStatus: vi.fn(async () => status),
      };
      await expect(new ProductDraftAdminGate(reader, true).assertEnabled()).rejects.toMatchObject({
        statusCode: 503,
        code: "admin_product_drafts_not_enabled",
      });
    },
  );

  it("checks the environment before reading durable state", async () => {
    const reader: ProductDraftImageCutoverStatusReader = {
      getStatus: vi.fn(async () => "completed"),
    };
    await expect(new ProductDraftAdminGate(reader, false).assertEnabled()).rejects.toBeInstanceOf(
      AdminProductDraftGateError,
    );
    expect(reader.getStatus).not.toHaveBeenCalled();
  });

  it("caches only a completed state for at most 30 seconds", async () => {
    let now = 1_000;
    const reader: ProductDraftImageCutoverStatusReader = {
      getStatus: vi.fn(async () => "completed"),
    };
    const gate = new ProductDraftAdminGate(reader, true, () => now);

    await gate.assertEnabled();
    now += 29_999;
    await gate.assertEnabled();
    expect(reader.getStatus).toHaveBeenCalledTimes(1);

    now += 1;
    await gate.assertEnabled();
    expect(reader.getStatus).toHaveBeenCalledTimes(2);
  });

  it("does not cache incomplete state or database failures", async () => {
    const getStatus = vi
      .fn<ProductDraftImageCutoverStatusReader["getStatus"]>()
      .mockResolvedValueOnce("pending")
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce("completed");
    const gate = new ProductDraftAdminGate({ getStatus }, true);

    await expect(gate.assertEnabled()).rejects.toBeInstanceOf(AdminProductDraftGateError);
    await expect(gate.assertEnabled()).rejects.toBeInstanceOf(AdminProductDraftGateError);
    await expect(gate.assertEnabled()).resolves.toBeUndefined();
    expect(getStatus).toHaveBeenCalledTimes(3);
  });
});
