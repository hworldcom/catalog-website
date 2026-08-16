import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseSellerProductDraftReadRepository } from "./supabase-seller-product-draft-read.repository";

describe("SupabaseSellerProductDraftReadRepository", () => {
  it("keeps an archived product private until restore created a working copy", async () => {
    const products = query({ data: archivedProduct(), error: null });
    const repository = new SupabaseSellerProductDraftReadRepository(
      { from: vi.fn(() => products) } as unknown as SupabaseClient<Database>,
      {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as unknown as SupabaseClient<Database>,
    );

    await expect(repository.findOwnedProduct(uuid(1), uuid(2))).resolves.toBeNull();

    expect(products.eq).toHaveBeenNthCalledWith(1, "id", uuid(1));
    expect(products.eq).toHaveBeenNthCalledWith(2, "seller_id", uuid(2));
    expect(products.neq).not.toHaveBeenCalled();
    expect(products.maybeSingle).toHaveBeenCalledOnce();
  });

  it("keeps an empty direct draft in seller-upload mode", async () => {
    const membership = query({ data: null, error: null });
    const images = query({ data: null, error: null });
    const admin = {
      from: vi.fn((table: string) =>
        table === "product_draft_source_memberships" ? membership : images,
      ),
    } as unknown as SupabaseClient<Database>;
    const repository = new SupabaseSellerProductDraftReadRepository(
      {} as SupabaseClient<Database>,
      admin,
    );

    await expect(repository.getImageSourceState(uuid(1))).resolves.toEqual({
      imageSourceMode: "seller_upload",
      usesDurableImagePublication: false,
    });
  });
});

function query(result: { data: unknown; error: null }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.neq.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  return builder;
}

function archivedProduct() {
  return {
    id: uuid(1),
    seller_id: uuid(2),
    status: "archived",
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
