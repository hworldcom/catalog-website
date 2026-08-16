import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import {
  SupabaseSellerProductListRepository,
  SupabaseSellerProductPreviewCandidateRepository,
} from "./supabase-seller-product-list.repository";

describe("SupabaseSellerProductListRepository", () => {
  it("applies seller ownership, stable ordering, limit, and tuple boundary", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [productRow()],
      error: null,
    });
    const repository = new SupabaseSellerProductListRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    const products = await repository.listProducts({
      sellerId: uuid(900),
      status: "archived",
      limit: 26,
      before: {
        version: 2,
        createdAt: "2026-07-27T09:00:00.000Z",
        productId: uuid(20),
        limit: 25,
        status: "archived",
      },
    });

    expect(products).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("list_seller_products_for_moderation", {
      p_seller_id: uuid(900),
      p_status: "archived",
      p_limit: 26,
      p_before_created_at: "2026-07-27T09:00:00.000Z",
      p_before_product_id: uuid(20),
    });
  });

  it("uses exact count-only queries for total and published products", async () => {
    const allProducts = query({ data: null, error: null, count: 12 });
    const publishedProducts = query({ data: null, error: null, count: 4 });
    const from = vi.fn().mockReturnValueOnce(allProducts).mockReturnValueOnce(publishedProducts);
    const repository = new SupabaseSellerProductListRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    await expect(repository.countProducts(uuid(900))).resolves.toEqual({
      productCount: 12,
      publishedProductCount: 4,
    });

    expect(allProducts.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(allProducts.eq).toHaveBeenCalledWith("seller_id", uuid(900));
    expect(allProducts.neq).toHaveBeenCalledWith("status", "archived");
    expect(publishedProducts.select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(publishedProducts.eq).toHaveBeenCalledWith("seller_id", uuid(900));
    expect(publishedProducts.eq).toHaveBeenCalledWith("status", "published");
  });
});

describe("SupabaseSellerProductPreviewCandidateRepository", () => {
  it("loads only server-derived ProductDraft identifiers in stable image order", async () => {
    const imagesQuery = query({
      data: [{ id: uuid(101), product_draft_id: uuid(1), source_position: 0 }],
      error: null,
      count: null,
    });
    const repository = new SupabaseSellerProductPreviewCandidateRepository({
      from: vi.fn(() => imagesQuery),
    } as unknown as SupabaseClient<Database>);

    await expect(repository.listImages([uuid(1), uuid(2)])).resolves.toHaveLength(1);

    expect(imagesQuery.in).toHaveBeenCalledWith("product_draft_id", [uuid(1), uuid(2)]);
    expect(imagesQuery.order).toHaveBeenNthCalledWith(1, "source_position", {
      ascending: true,
    });
    expect(imagesQuery.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: true,
    });
  });
});

function query(result: {
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
}) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    or: vi.fn(),
    in: vi.fn(),
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.neq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  return builder;
}

function productRow() {
  return {
    id: uuid(1),
    title: "Product",
    product_code: "SEL-F-TSH-ABCDEFGH",
    cover_image_id: null,
    cover_image_url: null,
    price: null,
    currency: "USD",
    moq: null,
    pack_size: null,
    stock: "in_stock",
    status: "draft",
    moderation_revision: 3,
    has_working_copy: false,
    review_submission_id: null,
    review_kind: null,
    review_revision: null,
    review_status: null,
    review_submitted_at: null,
    review_decided_at: null,
    review_seller_visible_reason: null,
    activation_run_id: null,
    activation_phase: null,
    activation_status: null,
    activation_dispatch_status: null,
    activation_dispatch_generation: null,
    activation_dispatch_error_code: null,
    activation_error_code: null,
    can_edit: true,
    can_submit: true,
    can_withdraw: false,
    can_abandon_failed_activation: false,
    can_retry_abandonment_cleanup: false,
    can_archive: true,
    can_restore: false,
    created_at: "2026-07-27T10:00:00.000Z",
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
