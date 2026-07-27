import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { SupabaseProductDraftImageDeliveryRepository } from "./supabase-product-draft-image-delivery.repository";

describe("SupabaseProductDraftImageDeliveryRepository", () => {
  it("loads products, images, and reconciliation state with set-based queries", async () => {
    const productDraftIds = [uuid(1), uuid(2)];
    const imageIds = [uuid(101), uuid(102)];
    const signal = new AbortController().signal;
    const productsQuery = query({
      data: productDraftIds.map((id) => ({ id })),
      error: null,
    });
    const imagesQuery = query({
      data: [
        {
          id: imageIds[0],
          product_draft_id: productDraftIds[0],
          status: "available",
          storage_bucket: "product-draft-images",
          destination_key: "product-drafts/one.jpg",
          content_type: "image/jpeg",
          size_bytes: 10,
        },
        {
          id: imageIds[1],
          product_draft_id: productDraftIds[1],
          status: "failed",
          storage_bucket: "product-draft-images",
          destination_key: "product-drafts/two.jpg",
          content_type: null,
          size_bytes: null,
        },
      ],
      error: null,
    });
    const reconciliationsQuery = query({
      data: [
        {
          product_draft_image_id: imageIds[0],
          status: "failed",
          error_code: "legacy_source_missing",
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "products") return productsQuery;
      if (table === "product_draft_images") return imagesQuery;
      if (table === "product_draft_image_storage_reconciliations") {
        return reconciliationsQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    });
    const repository = new SupabaseProductDraftImageDeliveryRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    const result = await repository.load(productDraftIds, imageIds, signal);

    expect(from).toHaveBeenCalledTimes(3);
    expect(productsQuery.in).toHaveBeenCalledWith("id", productDraftIds);
    expect(imagesQuery.in).toHaveBeenCalledWith("id", imageIds);
    expect(reconciliationsQuery.in).toHaveBeenCalledWith("product_draft_image_id", imageIds);
    expect(productsQuery.abortSignal).toHaveBeenCalledWith(signal);
    expect(imagesQuery.abortSignal).toHaveBeenCalledWith(signal);
    expect(reconciliationsQuery.abortSignal).toHaveBeenCalledWith(signal);
    expect(result.existingProductDraftIds).toEqual(new Set(productDraftIds));
    expect(result.images[0]).toMatchObject({
      productDraftId: productDraftIds[0],
      imageId: imageIds[0],
      reconciliationStatus: "failed",
      reconciliationErrorCode: "legacy_source_missing",
    });
    expect(result.images[1]).toMatchObject({
      productDraftId: productDraftIds[1],
      imageId: imageIds[1],
      reconciliationStatus: null,
      reconciliationErrorCode: null,
    });
  });

  it("does not query reconciliation state when no requested image exists", async () => {
    const productsQuery = query({
      data: [{ id: uuid(1) }],
      error: null,
    });
    const imagesQuery = query({ data: [], error: null });
    const from = vi.fn((table: string) => {
      if (table === "products") return productsQuery;
      if (table === "product_draft_images") return imagesQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    const repository = new SupabaseProductDraftImageDeliveryRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    await repository.load([uuid(1)], [uuid(101)], new AbortController().signal);

    expect(from).toHaveBeenCalledTimes(2);
  });
});

function query(result: { data: unknown[]; error: { message: string } | null }) {
  const builder = {
    select: vi.fn(),
    in: vi.fn(),
    abortSignal: vi.fn(async () => result),
  };
  builder.select.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  return builder;
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
