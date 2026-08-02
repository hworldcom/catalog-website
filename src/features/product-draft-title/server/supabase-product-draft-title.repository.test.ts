import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseProductDraftTitleRepository } from "./supabase-product-draft-title.repository";

describe("SupabaseProductDraftTitleRepository", () => {
  it("creates direct products through the allocation-aware database operation", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "created",
          product_draft_id: uuid(1),
          product_code: "QAR-F-TSH-ABCDEFGH",
          title: "Blue cotton shirt",
          title_source: "human",
          product_status: "draft",
          english_description: null,
        },
      ],
      error: null,
    }));
    const repository = new SupabaseProductDraftTitleRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    const result = await repository.create(
      uuid(2),
      { title: "Blue cotton shirt", titleSource: "human" },
      {
        category_id: uuid(3),
        moq: 2,
        pack_size: "4",
        price: 12.5,
        currency: "EUR",
        stock: "in_stock",
        cover_image_url: null,
        trending: false,
        status: "draft",
      },
    );

    expect(rpc).toHaveBeenCalledWith("create_seller_product_with_description", {
      p_seller_id: uuid(2),
      p_title_patch_present: true,
      p_title: "Blue cotton shirt",
      p_description_patch_present: false,
      p_description: null,
      p_category_id: uuid(3),
      p_moq: 2,
      p_pack_size: "4",
      p_price: 12.5,
      p_currency: "EUR",
      p_stock: "in_stock",
      p_cover_image_url_patch_present: true,
      p_cover_image_url: null,
      p_trending: false,
      p_status: "draft",
    });
    expect(result).toEqual({
      result: "created",
      productDraftId: uuid(1),
      title: "Blue cotton shirt",
      titleSource: "human",
      productStatus: "draft",
    });
  });

  it("returns stable product-code allocation failures from direct creation", async () => {
    const repository = new SupabaseProductDraftTitleRepository({
      rpc: vi.fn(async () => ({
        data: [
          {
            result: "product_code_allocation_failed",
            product_draft_id: null,
            product_code: null,
            title: null,
            title_source: null,
            product_status: null,
            english_description: null,
          },
        ],
        error: null,
      })),
    } as unknown as SupabaseClient<Database>);

    await expect(
      repository.create(
        uuid(2),
        { title: "Blue cotton shirt", titleSource: "human" },
        {
          category_id: uuid(3),
          currency: "EUR",
          stock: "in_stock",
          trending: false,
          status: "draft",
        },
      ),
    ).resolves.toEqual({ result: "product_code_allocation_failed" });
  });

  it("saves touched title, description, and seller fields through one database function", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "updated",
          product_draft_id: uuid(1),
          title: "Blue cotton shirt",
          title_source: "human",
          product_status: "draft",
          english_description: "Lightweight shirt",
        },
      ],
      error: null,
    }));
    const repository = new SupabaseProductDraftTitleRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    const result = await repository.update(
      uuid(1),
      uuid(2),
      {
        title: "Blue cotton shirt",
        titleSource: "human",
      },
      {
        description: "Lightweight shirt",
        category_id: uuid(3),
        moq: 2,
        pack_size: "4",
        price: 12.5,
        currency: "EUR",
        stock: "in_stock",
        cover_image_url: null,
        trending: false,
        status: "draft",
      },
    );

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("save_seller_product_with_description", {
      p_product_draft_id: uuid(1),
      p_seller_id: uuid(2),
      p_title_patch_present: true,
      p_title: "Blue cotton shirt",
      p_description_patch_present: true,
      p_description: "Lightweight shirt",
      p_category_id: uuid(3),
      p_moq: 2,
      p_pack_size: "4",
      p_price: 12.5,
      p_currency: "EUR",
      p_stock: "in_stock",
      p_cover_image_url_patch_present: true,
      p_cover_image_url: null,
      p_trending: false,
      p_status: "draft",
    });
    expect(result).toEqual({
      result: "updated",
      productDraftId: uuid(1),
      title: "Blue cotton shirt",
      titleSource: "human",
      productStatus: "draft",
    });
  });

  it("preserves untouched title and English description while saving other seller fields", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          result: "updated",
          product_draft_id: uuid(1),
          title: "Model title",
          title_source: "model",
          product_status: "draft",
          english_description: "Existing description",
        },
      ],
      error: null,
    }));
    const repository = new SupabaseProductDraftTitleRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    await repository.update(uuid(1), uuid(2), null, {
      category_id: null,
      moq: 1,
      pack_size: "1",
      price: 10,
      currency: "EUR",
      stock: "in_stock",
      cover_image_url: null,
      trending: false,
      status: "draft",
    });

    expect(rpc).toHaveBeenLastCalledWith(
      "save_seller_product_with_description",
      expect.objectContaining({
        p_title_patch_present: false,
        p_title: null,
        p_description_patch_present: false,
        p_description: null,
        p_cover_image_url_patch_present: true,
      }),
    );
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
