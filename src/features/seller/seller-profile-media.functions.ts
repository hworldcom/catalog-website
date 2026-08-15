import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import type { ZodType } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import {
  prepareSellerProfileAssetUploadSchema,
  SellerProfileImageError,
  sellerProfileAssetIdentifierSchema,
} from "./seller-profile-media.types";
import { getCurrentSellerId } from "./server/current-seller.service";
import type { SellerProfileMediaService } from "./server/seller-profile-media.service";

export const prepareMySellerProfileAssetUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseInput(prepareSellerProfileAssetUploadSchema, input))
  .handler(async ({ data, context }) =>
    withMediaService(context, (service, sellerId) => service.prepare(sellerId, data)),
  );

export const finalizeMySellerProfileAssetUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseInput(sellerProfileAssetIdentifierSchema, input))
  .handler(async ({ data, context }) =>
    withMediaService(context, (service, sellerId) => service.finalize(sellerId, data.assetId)),
  );

export const removeMySellerProfileAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseInput(sellerProfileAssetIdentifierSchema, input))
  .handler(async ({ data, context }) =>
    withMediaService(context, (service, sellerId) => service.remove(sellerId, data.assetId)),
  );

export const retryMySellerProfileAssetCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseInput(sellerProfileAssetIdentifierSchema, input))
  .handler(async ({ data, context }) =>
    withMediaService(context, (service, sellerId) => service.retryCleanup(sellerId, data.assetId)),
  );

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new SellerProfileImageError(
    400,
    "seller_profile_image_invalid",
    "The seller profile image request is invalid.",
  );
}

async function withMediaService<T>(
  context: unknown,
  operation: (service: SellerProfileMediaService, sellerId: string) => Promise<T>,
): Promise<T> {
  const { supabase, userId } = context as {
    supabase: SupabaseClient<Database>;
    userId: string;
  };
  const sellerId = await getCurrentSellerId({ supabase, userId });
  if (!sellerId) {
    throw new SellerProfileImageError(
      403,
      "seller_profile_image_required_owner",
      "A seller profile is required to manage profile images.",
    );
  }

  try {
    const { getSellerProfileMediaService } = await import("./server/seller-profile-media.runtime");
    return await operation(getSellerProfileMediaService(), sellerId);
  } catch (error) {
    if (error instanceof SellerProfileImageError) throw error;
    console.error("[Seller profile image] Lifecycle operation failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw new SellerProfileImageError(
      503,
      "seller_profile_image_storage_unavailable",
      "Seller profile image storage is temporarily unavailable.",
    );
  }
}
