import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import { getCurrentSellerId, requireCurrentSellerId } from "./server/current-seller.service";
import {
  emptySellerProductListPage,
  emptySellerProductSummary,
  parseSellerProductListRequest,
} from "./seller-product-list.types";
import { sellerProductIdSchema, sellerProductSaveSchema } from "./seller-product-write.types";

export const listMyProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerProductListRequest)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: SupabaseClient<Database>;
      userId: string;
    };

    const sellerId = await getCurrentSellerId({ supabase, userId });
    let page = emptySellerProductListPage();
    if (sellerId) {
      const { createSellerProductListService } =
        await import("./server/seller-product-list.runtime");
      page = await (await createSellerProductListService(supabase)).list(sellerId, data);
    }

    const { applyPrivateProductDraftImageResponseHeaders } =
      await import("@/features/admin/server/product-draft-image-delivery.response");
    applyPrivateProductDraftImageResponseHeaders();
    return page;
  });

export const getMyProductSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as {
      supabase: SupabaseClient<Database>;
      userId: string;
    };

    const sellerId = await getCurrentSellerId({ supabase, userId });
    if (!sellerId) return emptySellerProductSummary();

    const { createSellerProductSummaryService } =
      await import("./server/seller-product-list.runtime");
    return createSellerProductSummaryService(supabase).get(sellerId);
  });

export const getMyProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().optional() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };

    const [{ SellerProductDraftReadService }, { SupabaseSellerProductDraftReadRepository }] =
      await Promise.all([
        import("./server/seller-product-draft-read.service"),
        import("./server/supabase-seller-product-draft-read.repository"),
      ]);
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const result = await new SellerProductDraftReadService(
      new SupabaseSellerProductDraftReadRepository(supabase, supabaseAdmin),
    ).get({
      routeProductDraftId: data.id ?? "",
      userId,
      loadGallery: async (productDraft) => {
        const { createSellerProductDraftImageGalleryService } =
          await import("./server/seller-product-draft-image-gallery.runtime");
        return (await createSellerProductDraftImageGalleryService()).get(productDraft);
      },
    });

    if (result.gallery) {
      const { applyPrivateProductDraftImageResponseHeaders } =
        await import("@/features/admin/server/product-draft-image-delivery.response");
      applyPrivateProductDraftImageResponseHeaders();
    }
    return result;
  });

export const saveMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => sellerProductSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };

    const sellerId = data.id
      ? await getCurrentSellerId({ supabase, userId })
      : await requireCurrentSellerId({ supabase, userId });
    if (!sellerId) throw new Error("Product not found");

    const productFields = {
      ...(data.description !== undefined ? { description: data.description } : {}),
      category_id: data.category_id || null,
      moq: data.moq ?? null,
      pack_size: data.pack_size || null,
      price: data.price ?? null,
      currency: data.currency || "USD",
      stock: data.stock,
      ...(data.cover_image_url !== undefined
        ? { cover_image_url: data.cover_image_url || null }
        : {}),
      trending: data.trending,
      status: data.publish ? ("published" as const) : ("draft" as const),
    };

    const { createProductDraftTitlePersistenceService } =
      await import("@/features/product-draft-title/server/product-draft-title.runtime");
    const saved = await (
      await createProductDraftTitlePersistenceService()
    ).saveSellerProduct({
      productDraftId: data.id,
      sellerId,
      title: data.title,
      productFields,
    });

    return {
      id: saved.productDraftId,
      title: saved.title,
      titleSource: saved.titleSource,
      status: saved.productStatus,
    };
  });

export const deleteMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: sellerProductIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };

    const sellerId = await getCurrentSellerId({ supabase, userId });
    if (!sellerId) throw new Error("Product not found");

    const { data: deleted, error } = await supabase
      .from("products")
      .delete()
      .eq("id", data.id)
      .eq("seller_id", sellerId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error("Product not found");

    return { ok: true };
  });
