import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseAdminProductDraftIndexRepository } from "./supabase-admin-product-draft-index.repository";

describe("SupabaseAdminProductDraftIndexRepository", () => {
  it("applies stable ordering, exact filters, and the tuple cursor", async () => {
    const productsQuery = query({
      data: [
        {
          id: uuid(1),
          product_code: "SEL-F-TSH-ABCDEFGH",
          title: "Draft",
          status: "draft",
          seller_id: uuid(10),
          category_id: null,
          cover_image_id: null,
          created_at: "2026-07-24T12:00:00.000Z",
          updated_at: "2026-07-24T12:00:00.000Z",
        },
      ],
      error: null,
    });
    const from = vi.fn(() => productsQuery);
    const repository = new SupabaseAdminProductDraftIndexRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    const rows = await repository.listProducts({
      limit: 26,
      status: "draft",
      sellerId: uuid(10),
      before: {
        version: 1,
        createdAt: "2026-07-24T11:00:00.000Z",
        productDraftId: uuid(2),
        limit: 25,
        status: "draft",
        sellerId: uuid(10),
      },
    });

    expect(rows).toHaveLength(1);
    expect(productsQuery.select).toHaveBeenCalledWith(
      "id,product_code,title,status,seller_id,category_id,cover_image_id,created_at,updated_at",
    );
    expect(productsQuery.order).toHaveBeenNthCalledWith(1, "created_at", {
      ascending: false,
    });
    expect(productsQuery.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: false,
    });
    expect(productsQuery.limit).toHaveBeenCalledWith(26);
    expect(productsQuery.eq).toHaveBeenCalledWith("status", "draft");
    expect(productsQuery.eq).toHaveBeenCalledWith("seller_id", uuid(10));
    expect(productsQuery.or).toHaveBeenCalledWith(
      `created_at.lt."2026-07-24T11:00:00.000Z",and(created_at.eq."2026-07-24T11:00:00.000Z",id.lt.${uuid(2)})`,
    );
  });

  it("loads all page details with bounded set-based queries", async () => {
    const draft = {
      id: uuid(1),
      product_code: "SEL-F-TSH-ABCDEFGH",
      title: "Draft",
      status: "draft" as const,
      seller_id: uuid(10),
      category_id: uuid(20),
      cover_image_id: null,
      created_at: "2026-07-24T12:00:00.000Z",
      updated_at: "2026-07-24T12:00:00.000Z",
    };
    const tables = {
      sellers: query({ data: [{ id: uuid(10), name: "Seller", slug: "seller" }], error: null }),
      categories: query({
        data: [{ id: uuid(20), name: "Trousers", slug: "trousers" }],
        error: null,
      }),
      product_draft_facts: query({
        data: [{ product_draft_id: draft.id, facts_revision: 2 }],
        error: null,
      }),
      product_draft_source_memberships: query({
        data: [
          {
            product_draft_id: draft.id,
            classifier_organization_id: uuid(30),
            classifier_batch_id: uuid(31),
            classifier_group_id: uuid(32),
          },
        ],
        error: null,
      }),
      product_draft_images: query({
        data: [{ id: uuid(101), product_draft_id: draft.id, source_position: 0 }],
        error: null,
      }),
    };
    const from = vi.fn((table: keyof typeof tables) => tables[table]);
    const repository = new SupabaseAdminProductDraftIndexRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    const result = await repository.loadDetails([draft]);

    expect(from).toHaveBeenCalledTimes(5);
    expect(tables.sellers.in).toHaveBeenCalledWith("id", [uuid(10)]);
    expect(tables.categories.in).toHaveBeenCalledWith("id", [uuid(20)]);
    expect(tables.product_draft_facts.in).toHaveBeenCalledWith("product_draft_id", [draft.id]);
    expect(tables.product_draft_source_memberships.in).toHaveBeenCalledWith("product_draft_id", [
      draft.id,
    ]);
    expect(tables.product_draft_images.in).toHaveBeenCalledWith("product_draft_id", [draft.id]);
    expect(result.images[0]?.id).toBe(uuid(101));
  });
});

function query(result: { data: unknown[]; error: { message: string } | null }) {
  const builder = {
    select: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    in: vi.fn(),
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  builder.select.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  return builder;
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
