import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseSellerProductDraftReadRepository } from "./supabase-seller-product-draft-read.repository";

describe("SupabaseSellerProductDraftReadRepository", () => {
  it("excludes archived products from the seller-owned detail read", async () => {
    const products = query({ data: null, error: null });
    const repository = new SupabaseSellerProductDraftReadRepository(
      { from: vi.fn(() => products) } as unknown as SupabaseClient<Database>,
      {} as SupabaseClient<Database>,
    );

    await expect(repository.findOwnedProduct(uuid(1), uuid(2))).resolves.toBeNull();

    expect(products.eq).toHaveBeenNthCalledWith(1, "id", uuid(1));
    expect(products.eq).toHaveBeenNthCalledWith(2, "seller_id", uuid(2));
    expect(products.neq).toHaveBeenCalledWith("status", "archived");
    expect(products.maybeSingle).toHaveBeenCalledOnce();
  });
});

function query(result: { data: null; error: null }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.neq.mockReturnValue(builder);
  return builder;
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
