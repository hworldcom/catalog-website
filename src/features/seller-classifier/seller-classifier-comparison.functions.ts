import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentSellerId } from "@/features/seller/server/current-seller.service";
import { requireClassifierAssistedUpload } from "@/features/classifier-release/classifier-assisted-upload.middleware";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import { SellerClassifierBatchError } from "./seller-classifier-batch.types";
import { parseSellerClassifierComparisonInput } from "./seller-classifier-comparison.types";
import type { SellerClassifierComparisonService } from "./server/seller-classifier-comparison.service";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export const dispatchMyClassifierMultimodalComparison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireClassifierAssistedUpload])
  .validator(parseSellerClassifierComparisonInput)
  .handler(async ({ data, context }) =>
    withComparisonService(context as AuthenticatedContext, (service, sellerId) =>
      service.dispatch(data.workflowId, sellerId),
    ),
  );

export const getMyClassifierMultimodalComparisonStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireClassifierAssistedUpload])
  .validator(parseSellerClassifierComparisonInput)
  .handler(async ({ data, context }) =>
    withComparisonService(context as AuthenticatedContext, (service, sellerId) =>
      service.getStatus(data.workflowId, sellerId),
    ),
  );

async function withComparisonService<TResult>(
  context: AuthenticatedContext,
  operation: (service: SellerClassifierComparisonService, sellerId: string) => Promise<TResult>,
): Promise<TResult> {
  try {
    const sellerId = await getCurrentSellerId(context);
    if (!sellerId) {
      throw new SellerClassifierBatchError(
        404,
        "seller_classifier_batch_not_found",
        "The classifier workflow was not found.",
      );
    }
    return await operation(await getComparisonService(), sellerId);
  } catch (error) {
    if (error instanceof SellerClassifierBatchError) throw error;
    console.error("[Seller classifier comparison] Operation failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw new SellerClassifierBatchError(
      503,
      "seller_classifier_multimodal_comparison_unavailable",
      "Multimodal comparison is temporarily unavailable.",
    );
  }
}

async function getComparisonService(): Promise<SellerClassifierComparisonService> {
  const { getSellerClassifierComparisonService } =
    await import("./server/seller-classifier-batch.runtime");
  return getSellerClassifierComparisonService();
}
