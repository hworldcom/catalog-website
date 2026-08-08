import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import {
  finalizeProductDraftImageUploadsSchema,
  prepareProductDraftImageUploadsSchema,
  ProductDraftImageLifecycleError,
  removeProductDraftImageSchema,
  retryProductDraftImageCleanupSchema,
  updateProductDraftImageGallerySchema,
} from "./product-draft-image-lifecycle.types";
import { getCurrentSellerId } from "./server/current-seller.service";
import type { ProductDraftImageLifecycleService } from "./server/product-draft-image-lifecycle.service";

export const prepareMyProductDraftImageUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseInput(prepareProductDraftImageUploadsSchema, input))
  .handler(async ({ data, context }) =>
    withLifecycleService(context, (service, sellerId) => service.prepare(sellerId, data)),
  );

export const finalizeMyProductDraftImageUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseInput(finalizeProductDraftImageUploadsSchema, input))
  .handler(async ({ data, context }) =>
    withLifecycleService(context, (service, sellerId) => service.finalize(sellerId, data)),
  );

export const updateMyProductDraftImageGallery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseInput(updateProductDraftImageGallerySchema, input))
  .handler(async ({ data, context }) =>
    withLifecycleService(context, (service, sellerId) => service.update(sellerId, data)),
  );

export const removeMyProductDraftImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseInput(removeProductDraftImageSchema, input))
  .handler(async ({ data, context }) =>
    withLifecycleService(context, (service, sellerId) => service.remove(sellerId, data)),
  );

export const retryMyProductDraftImageCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseInput(retryProductDraftImageCleanupSchema, input))
  .handler(async ({ data, context }) =>
    withLifecycleService(context, (service, sellerId) => service.retryCleanup(sellerId, data)),
  );

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new ProductDraftImageLifecycleError(
    400,
    "product_draft_image_upload_invalid",
    "The ProductDraft image request is invalid.",
  );
}

async function withLifecycleService<T>(
  context: unknown,
  operation: (service: ProductDraftImageLifecycleService, sellerId: string) => Promise<T>,
): Promise<T> {
  const { supabase, userId } = context as {
    supabase: SupabaseClient<Database>;
    userId: string;
  };
  const sellerId = await getCurrentSellerId({ supabase, userId });
  if (!sellerId) {
    throw new ProductDraftImageLifecycleError(
      404,
      "product_draft_image_not_found",
      "The ProductDraft image was not found.",
    );
  }

  try {
    const { createProductDraftImageLifecycleService } =
      await import("./server/product-draft-image-lifecycle.runtime");
    return await operation(await createProductDraftImageLifecycleService(), sellerId);
  } catch (error) {
    if (error instanceof ProductDraftImageLifecycleError) throw error;
    console.error("[Seller ProductDraft images] Lifecycle operation failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw new ProductDraftImageLifecycleError(
      503,
      "product_draft_image_storage_unavailable",
      "Private ProductDraft image storage is temporarily unavailable.",
    );
  }
}
