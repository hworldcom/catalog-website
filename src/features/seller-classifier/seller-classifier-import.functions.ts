import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentSellerId } from "@/features/seller/server/current-seller.service";
import { requireClassifierAssistedUpload } from "@/features/classifier-release/classifier-assisted-upload.middleware";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import { SellerClassifierBatchError } from "./seller-classifier-batch.types";
import { parseSellerClassifierImportInput } from "./seller-classifier-import.types";
import type { SellerClassifierImportService } from "./server/seller-classifier-import.service";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export const approveMyClassifierBatchAndCreateDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireClassifierAssistedUpload])
  .validator(parseSellerClassifierImportInput)
  .handler(async ({ data, context }) =>
    withImportService(context as AuthenticatedContext, (service, sellerId, userId) =>
      service.approveAndCreateDrafts(data.workflowId, sellerId, userId),
    ),
  );

export const getMyClassifierDraftImport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireClassifierAssistedUpload])
  .validator(parseSellerClassifierImportInput)
  .handler(async ({ data, context }) =>
    withImportService(context as AuthenticatedContext, (service, sellerId) =>
      service.getStatus(data.workflowId, sellerId),
    ),
  );

export const retryMyClassifierDraftImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireClassifierAssistedUpload])
  .validator(parseSellerClassifierImportInput)
  .handler(async ({ data, context }) =>
    withImportService(context as AuthenticatedContext, (service, sellerId) =>
      service.retry(data.workflowId, sellerId),
    ),
  );

async function withImportService<TResult>(
  context: AuthenticatedContext,
  operation: (
    service: SellerClassifierImportService,
    sellerId: string,
    userId: string,
  ) => Promise<TResult>,
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
    return await operation(await getImportService(), sellerId, context.userId);
  } catch (error) {
    if (error instanceof SellerClassifierBatchError) throw error;
    if (
      error instanceof Error &&
      (error.message.startsWith("Invalid classifier import configuration:") ||
        error.message.startsWith("seller_classifier_configuration_invalid:") ||
        error.message.startsWith("Missing Supabase environment variable"))
    ) {
      throw new SellerClassifierBatchError(
        500,
        "seller_classifier_configuration_invalid",
        "Seller classifier workflows are not configured.",
      );
    }
    console.error("[Seller classifier import] Operation failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw new SellerClassifierBatchError(
      500,
      "seller_classifier_import_unavailable",
      "The seller classifier import is temporarily unavailable.",
    );
  }
}

async function getImportService(): Promise<SellerClassifierImportService> {
  const { getSellerClassifierImportService } =
    await import("./server/seller-classifier-batch.runtime");
  return getSellerClassifierImportService();
}
