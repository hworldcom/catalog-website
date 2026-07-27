import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseAdminProductDraftReviewRepository } from "./supabase-admin-product-draft-review.repository";

describe("SupabaseAdminProductDraftReviewRepository", () => {
  it("loads one ProductDraft and its context with deterministic image ordering", async () => {
    const product = {
      id: uuid(1),
      title: "Draft",
      title_source: "human" as const,
      status: "draft" as const,
      seller_id: uuid(10),
      category_id: uuid(20),
      cover_image_id: uuid(101),
      created_at: "2026-07-24T12:00:00.000Z",
      updated_at: "2026-07-24T13:00:00.000Z",
    };
    const tables = {
      products: singleQuery({ data: product, error: null }),
      sellers: singleQuery({
        data: { id: uuid(10), name: "Seller", slug: "seller" },
        error: null,
      }),
      categories: singleQuery({
        data: { id: uuid(20), name: "Trousers", slug: "trousers" },
        error: null,
      }),
      product_draft_source_memberships: listQuery({
        data: [
          {
            product_draft_id: product.id,
            classifier_organization_id: uuid(30),
            classifier_batch_id: uuid(31),
            classifier_group_id: uuid(32),
          },
        ],
        error: null,
      }),
      product_draft_images: listQuery({
        data: [
          {
            id: uuid(101),
            product_draft_id: product.id,
            source_position: 0,
            status: "available",
          },
        ],
        error: null,
      }),
    };
    const from = vi.fn((table: keyof typeof tables) => tables[table]);
    const repository = new SupabaseAdminProductDraftReviewRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    const result = await repository.load(product.id);

    expect(from).toHaveBeenCalledTimes(5);
    expect(tables.products.eq).toHaveBeenCalledWith("id", product.id);
    expect(tables.sellers.eq).toHaveBeenCalledWith("id", product.seller_id);
    expect(tables.categories.eq).toHaveBeenCalledWith("id", product.category_id);
    expect(tables.product_draft_source_memberships.eq).toHaveBeenCalledWith(
      "product_draft_id",
      product.id,
    );
    expect(tables.product_draft_images.order).toHaveBeenNthCalledWith(1, "source_position", {
      ascending: true,
    });
    expect(tables.product_draft_images.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: true,
    });
    expect(result?.images[0]?.id).toBe(uuid(101));
  });

  it("stops after the product lookup when the ProductDraft does not exist", async () => {
    const products = singleQuery({ data: null, error: null });
    const from = vi.fn(() => products);
    const repository = new SupabaseAdminProductDraftReviewRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    await expect(repository.load(uuid(1))).resolves.toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
  });
});

function singleQuery(result: { data: unknown; error: { message: string } | null }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

function listQuery(result: { data: unknown[]; error: { message: string } | null }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  return builder;
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
