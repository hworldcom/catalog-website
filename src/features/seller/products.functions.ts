import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  ProductDraftTitleError,
  type ProductDraftTitleSnapshot,
} from "@/features/product-draft-title/product-draft-title.types";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import { getCurrentSellerId, requireCurrentSellerId } from "./server/current-seller.service";
import {
  emptySellerProductListPage,
  emptySellerProductSummary,
  parseSellerProductListRequest,
} from "./seller-product-list.types";
import { parseSellerProductSave } from "./seller-product-write.types";
import { invalidProductModerationStatusRequest } from "./product-moderation-status.types";

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

export const getMyProductModerationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => {
    const parsed = z.object({ id: z.string().uuid() }).strict().safeParse(input);
    if (!parsed.success) throw invalidProductModerationStatusRequest();
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: SupabaseClient<Database>;
      userId: string;
    };
    const sellerId = await getCurrentSellerId({ supabase, userId });
    if (!sellerId) {
      const { productModerationStatusNotFound } = await import("./product-moderation-status.types");
      throw productModerationStatusNotFound();
    }
    const { createProductModerationStatusService } =
      await import("./server/product-moderation-status.runtime");
    const result = await (await createProductModerationStatusService()).get(data.id, sellerId);
    const { applyPrivateProductDraftImageResponseHeaders } =
      await import("@/features/admin/server/product-draft-image-delivery.response");
    applyPrivateProductDraftImageResponseHeaders();
    return result;
  });

export const saveMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerProductSave)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };

    const sellerId = data.id
      ? await getCurrentSellerId({ supabase, userId })
      : await requireCurrentSellerId({ supabase, userId });
    if (!sellerId) throw new Error("Product not found");
    let durableStatus: "draft" | "published" | "archived" = "draft";
    if (data.id) {
      const ownedProduct = await supabase
        .from("products")
        .select("id,status")
        .eq("id", data.id)
        .eq("seller_id", sellerId)
        .maybeSingle();
      if (ownedProduct.error) throw new Error(ownedProduct.error.message);
      if (!ownedProduct.data) {
        throw new ProductDraftTitleError(
          404,
          "product_audience_product_not_found",
          "The product was not found.",
        );
      }
      durableStatus = ownedProduct.data.status;
    }

    const productFields = {
      ...(data.audiences !== undefined ? { audiences: data.audiences } : {}),
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
      status: durableStatus,
    };

    const { createProductDraftTitlePersistenceService } =
      await import("@/features/product-draft-title/server/product-draft-title.runtime");
    const saved: ProductDraftTitleSnapshot = await (
      await createProductDraftTitlePersistenceService()
    ).saveSellerProduct({
      productDraftId: data.id,
      expectedModerationRevision: data.expectedModerationRevision,
      sellerId,
      title: data.title,
      productFields,
    });

    return {
      id: saved.productDraftId,
      title: saved.title,
      titleSource: saved.titleSource,
      status: saved.productStatus,
      moderationRevision: saved.moderationRevision,
    };
  });

export const archiveMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        id: z.string().uuid(),
        expectedModerationRevision: z.number().int().positive(),
        requestId: z.string().uuid(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };

    const sellerId = await getCurrentSellerId({ supabase, userId });
    const { createSellerProductArchiveService } =
      await import("./server/seller-product-archive.runtime");
    return (await createSellerProductArchiveService()).archive({
      productId: data.id,
      sellerId,
      actorUserId: userId,
      expectedModerationRevision: data.expectedModerationRevision,
      requestId: data.requestId,
    });
  });

export const restoreMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        id: z.string().uuid(),
        expectedModerationRevision: z.number().int().positive(),
        requestId: z.string().uuid(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };

    const sellerId = await getCurrentSellerId({ supabase, userId });
    const { createSellerProductArchiveService } =
      await import("./server/seller-product-archive.runtime");
    return (await createSellerProductArchiveService()).restore({
      productId: data.id,
      sellerId,
      actorUserId: userId,
      expectedModerationRevision: data.expectedModerationRevision,
      requestId: data.requestId,
    });
  });
