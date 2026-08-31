import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentSellerId } from "@/features/seller/server/current-seller.service";
import { requireClassifierAssistedUpload } from "@/features/classifier-release/classifier-assisted-upload.middleware";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import {
  parseSellerClassifierHistoryRequest,
  SellerClassifierHistoryError,
  sellerClassifierHistoryUnavailable,
} from "./seller-classifier-history.types";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export const listMyClassifierBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireClassifierAssistedUpload])
  .validator(parseSellerClassifierHistoryRequest)
  .handler(async ({ data, context }) => {
    try {
      const authenticated = context as AuthenticatedContext;
      const sellerId = await getCurrentSellerId(authenticated);
      if (!sellerId) {
        throw new SellerClassifierHistoryError(
          404,
          "seller_not_found",
          "A seller profile is required to read classifier workflow history.",
        );
      }

      const { getSellerClassifierHistoryService } =
        await import("./server/seller-classifier-history.runtime");
      return await (await getSellerClassifierHistoryService()).list(sellerId, data);
    } catch (error) {
      if (error instanceof SellerClassifierHistoryError) throw error;
      console.error("[Seller classifier history] Read failed.", {
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
      throw sellerClassifierHistoryUnavailable();
    }
  });
