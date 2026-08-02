import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseSellerProductArchiveRepository } from "./supabase-seller-product-archive.repository";

const productId = uuid(1);
const sellerId = uuid(2);

describe("SupabaseSellerProductArchiveRepository", () => {
  it("calls the protected operation and parses archived success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ result: "archived", product_id: productId, product_status: "archived" }],
      error: null,
    });
    const repository = new SupabaseSellerProductArchiveRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    await expect(repository.archive(productId, sellerId)).resolves.toEqual({
      result: "archived",
      productId,
      productStatus: "archived",
    });
    expect(rpc).toHaveBeenCalledWith("archive_seller_product", {
      p_product_id: productId,
      p_seller_id: sellerId,
    });
  });

  it.each(["product_not_found", "product_archive_not_allowed"] as const)(
    "parses %s without requiring disclosed product fields",
    async (result) => {
      const repository = new SupabaseSellerProductArchiveRepository({
        rpc: vi.fn().mockResolvedValue({
          data: [{ result, product_id: null, product_status: null }],
          error: null,
        }),
      } as unknown as SupabaseClient<Database>);

      await expect(repository.archive(productId, sellerId)).resolves.toEqual({ result });
    },
  );

  it("rejects database and malformed operation results", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "raw database error" } })
      .mockResolvedValueOnce({
        data: [{ result: "archived", product_id: null, product_status: "archived" }],
        error: null,
      });
    const repository = new SupabaseSellerProductArchiveRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    await expect(repository.archive(productId, sellerId)).rejects.toThrow(
      "Seller product archive operation failed.",
    );
    await expect(repository.archive(productId, sellerId)).rejects.toThrow(
      "Seller product archive returned an invalid result.",
    );
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
