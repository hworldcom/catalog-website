import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import { getCurrentSellerId } from "@/features/seller/server/current-seller.service";
import {
  parseCreateSellerClassifierBatchInput,
  parseSellerClassifierWorkflowInput,
  SellerClassifierBatchError,
} from "./seller-classifier-batch.types";
import type {
  SellerClassifierBatchOwnershipService,
  SellerClassifierBatchService,
} from "./server/seller-classifier-batch.service";
import {
  parseRegisterSellerClassifierUploadsInput,
  parseRetrySellerClassifierUploadsInput,
  parseSellerClassifierCommandInput,
} from "./seller-classifier-workflow.types";
import type { SellerClassifierWorkflowService } from "./server/seller-classifier-workflow.service";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export const createMyClassifierBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseCreateSellerClassifierBatchInput)
  .handler(async ({ data, context }) =>
    withOwnedService(
      context as AuthenticatedContext,
      getProvisioningService,
      (service, sellerId, userId) =>
        service.create({
          sellerId,
          userId,
          requestId: data.requestId,
        }),
    ),
  );

export const getMyClassifierBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerClassifierWorkflowInput)
  .handler(async ({ data, context }) =>
    withOwnedService(context as AuthenticatedContext, getOwnershipService, (service, sellerId) =>
      service.get(data.workflowId, sellerId),
    ),
  );

export const retryMyClassifierBatchProvisioning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerClassifierWorkflowInput)
  .handler(async ({ data, context }) =>
    withOwnedService(context as AuthenticatedContext, getProvisioningService, (service, sellerId) =>
      service.retry(data.workflowId, sellerId),
    ),
  );

export const registerMyClassifierUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseRegisterSellerClassifierUploadsInput)
  .handler(async ({ data, context }) =>
    withOwnedService(context as AuthenticatedContext, getWorkflowService, (service, sellerId) =>
      service.register(sellerId, data),
    ),
  );

export const retryMyClassifierUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseRetrySellerClassifierUploadsInput)
  .handler(async ({ data, context }) =>
    withOwnedService(context as AuthenticatedContext, getWorkflowService, (service, sellerId) =>
      service.retryUploads(data.workflowId, sellerId, data.imageIds),
    ),
  );

export const getMyClassifierUploads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerClassifierCommandInput)
  .handler(async ({ data, context }) =>
    withOwnedService(context as AuthenticatedContext, getWorkflowService, (service, sellerId) =>
      service.getUploads(data.workflowId, sellerId),
    ),
  );

export const finalizeMyClassifierUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerClassifierCommandInput)
  .handler(async ({ data, context }) =>
    withOwnedService(context as AuthenticatedContext, getWorkflowService, (service, sellerId) =>
      service.finalize(data.workflowId, sellerId),
    ),
  );

export const startMyClassifierProcessing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerClassifierCommandInput)
  .handler(async ({ data, context }) =>
    withOwnedService(context as AuthenticatedContext, getWorkflowService, (service, sellerId) =>
      service.startProcessing(data.workflowId, sellerId),
    ),
  );

export const getMyClassifierProcessing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(parseSellerClassifierCommandInput)
  .handler(async ({ data, context }) =>
    withOwnedService(context as AuthenticatedContext, getWorkflowService, (service, sellerId) =>
      service.getProcessing(data.workflowId, sellerId),
    ),
  );

async function withOwnedService<TService, TResult>(
  context: AuthenticatedContext,
  getService: () => Promise<TService>,
  operation: (service: TService, sellerId: string, userId: string) => Promise<TResult>,
): Promise<TResult> {
  try {
    const sellerId = await getCurrentSellerId(context);
    if (!sellerId) {
      throw new SellerClassifierBatchError(
        404,
        "seller_not_found",
        "A seller profile is required to create classifier workflows.",
      );
    }

    return await operation(await getService(), sellerId, context.userId);
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
    console.error("[Seller classifier] Operation failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw new SellerClassifierBatchError(
      503,
      "seller_classifier_unavailable",
      "Seller classifier workflows are temporarily unavailable.",
    );
  }
}

async function getProvisioningService(): Promise<SellerClassifierBatchService> {
  const { getSellerClassifierBatchService } =
    await import("./server/seller-classifier-batch.runtime");
  return getSellerClassifierBatchService();
}

async function getOwnershipService(): Promise<SellerClassifierBatchOwnershipService> {
  const { getSellerClassifierBatchOwnershipService } =
    await import("./server/seller-classifier-batch.runtime");
  return getSellerClassifierBatchOwnershipService();
}

async function getWorkflowService(): Promise<SellerClassifierWorkflowService> {
  const { getSellerClassifierWorkflowService } =
    await import("./server/seller-classifier-batch.runtime");
  return getSellerClassifierWorkflowService();
}
