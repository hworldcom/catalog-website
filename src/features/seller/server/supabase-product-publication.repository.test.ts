import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseProductPublicationRepository } from "./supabase-product-publication.repository";

describe("SupabaseProductPublicationRepository", () => {
  it("accepts stable title-validation authorization results", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "title_required",
          product_draft_id: uuid(1),
          publication_status: null,
        },
      ],
      error: null,
    }));
    const repository = new SupabaseProductPublicationRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    await expect(repository.authorize(authorization())).resolves.toEqual({
      result: "title_required",
      productDraftId: uuid(1),
    });
  });

  it("reads only the first ordered non-null item error", async () => {
    const query = fluentQuery({
      data: { error_code: "product_publication_transfer_failed" },
      error: null,
    });
    const from = vi.fn(() => query);
    const repository = new SupabaseProductPublicationRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    await expect(repository.getFirstItemErrorCode(uuid(1))).resolves.toBe(
      "product_publication_transfer_failed",
    );
    expect(from).toHaveBeenCalledWith("product_image_publication_items");
    expect(query.select).toHaveBeenCalledWith("error_code");
    expect(query.not).toHaveBeenCalledWith("error_code", "is", null);
    expect(query.order).toHaveBeenNthCalledWith(1, "publication_order");
    expect(query.order).toHaveBeenNthCalledWith(2, "product_draft_image_id");
    expect(query.limit).toHaveBeenCalledWith(1);
  });
});

function fluentQuery(result: { data: { error_code: string } | null; error: null }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function authorization() {
  return {
    productDraftId: uuid(1),
    sellerId: uuid(2),
    titlePatchPresent: false,
    title: null,
    descriptionPatchPresent: false,
    description: null,
    categoryId: null,
    moq: null,
    packSize: null,
    price: null,
    currency: "EUR",
    stock: "in_stock" as const,
    coverImageUrlPatchPresent: false,
    coverImageUrl: null,
    trending: false,
    delegatedAction: null,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
