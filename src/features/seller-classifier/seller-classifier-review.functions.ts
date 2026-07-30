import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentSellerId } from "@/features/seller/server/current-seller.service";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import { SellerClassifierBatchError } from "./seller-classifier-batch.types";
import {
  parseCreateSellerClassifierGroupInput,
  parseMergeSellerClassifierGroupsInput,
  parseMoveSellerClassifierImageInput,
  parseSelectSellerClassifierCategoryInput,
  parseSelectSellerClassifierCoverInput,
  parseSellerClassifierGroupImageInput,
  parseSellerClassifierGroupInput,
  parseSellerClassifierReviewInput,
  parseSetSellerClassifierDuplicateInput,
  parseSplitSellerClassifierGroupInput,
} from "./seller-classifier-review.types";
import type { SellerClassifierReviewService } from "./server/seller-classifier-review.service";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export const getMyClassifierReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerClassifierReviewInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.getReview(data.workflowId, sellerId),
    ),
  );

export const listSellerClassifierCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withReviewService(context as AuthenticatedContext, (service) => service.listCategories()),
  );

export const createMyClassifierGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseCreateSellerClassifierGroupInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.createGroup(sellerId, data),
    ),
  );

export const mergeMyClassifierGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseMergeSellerClassifierGroupsInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.mergeGroups(sellerId, data),
    ),
  );

export const splitMyClassifierGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSplitSellerClassifierGroupInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.splitGroup(sellerId, data),
    ),
  );

export const moveMyClassifierImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseMoveSellerClassifierImageInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.moveImage(sellerId, data),
    ),
  );

export const setMyClassifierImageDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSetSellerClassifierDuplicateInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.setDuplicate(sellerId, data),
    ),
  );

export const selectMyClassifierGroupCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSelectSellerClassifierCoverInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.selectCover(sellerId, data),
    ),
  );

export const selectMyClassifierGroupCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSelectSellerClassifierCategoryInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.selectCategory(sellerId, data),
    ),
  );

export const rejectMyClassifierImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerClassifierGroupImageInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.rejectImage(sellerId, data),
    ),
  );

export const restoreMyClassifierImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerClassifierGroupImageInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.restoreImage(sellerId, data),
    ),
  );

export const approveMyClassifierGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerClassifierGroupInput)
  .handler(async ({ data, context }) =>
    withReviewService(context as AuthenticatedContext, (service, sellerId) =>
      service.approveGroup(sellerId, data),
    ),
  );

async function withReviewService<TResult>(
  context: AuthenticatedContext,
  operation: (service: SellerClassifierReviewService, sellerId: string) => Promise<TResult>,
): Promise<TResult> {
  try {
    const sellerId = await getCurrentSellerId(context);
    if (!sellerId) {
      throw new SellerClassifierBatchError(
        404,
        "seller_not_found",
        "A seller profile is required to review classifier workflows.",
      );
    }
    return await operation(await getReviewService(), sellerId);
  } catch (error) {
    if (error instanceof SellerClassifierBatchError) throw error;
    if (
      error instanceof Error &&
      (error.message.startsWith("seller_classifier_configuration_invalid:") ||
        error.message.startsWith("Missing Supabase environment variable"))
    ) {
      throw new SellerClassifierBatchError(
        500,
        "seller_classifier_configuration_invalid",
        "Seller classifier workflows are not configured.",
      );
    }
    console.error("[Seller classifier review] Operation failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw new SellerClassifierBatchError(
      503,
      "seller_classifier_unavailable",
      "The classifier is temporarily unavailable.",
    );
  }
}

async function getReviewService(): Promise<SellerClassifierReviewService> {
  const { getSellerClassifierReviewService } =
    await import("./server/seller-classifier-batch.runtime");
  return getSellerClassifierReviewService();
}
