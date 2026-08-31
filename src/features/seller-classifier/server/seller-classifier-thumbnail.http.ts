import { z } from "zod";

import { getCurrentSellerId } from "@/features/seller/server/current-seller.service";
import { classifierAssistedUploadGateResponse } from "@/features/classifier-release/server/classifier-assisted-upload-gate";
import {
  authenticateSupabaseRequest,
  SupabaseAuthenticationError,
  type AuthenticatedSupabaseRequest,
} from "@/lib/supabase/request-authentication";

import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import type { SellerClassifierReviewService } from "./seller-classifier-review.service";

const identifier = z.string().uuid();
const noStoreHeaders = { "Cache-Control": "no-store" };

export type SellerClassifierRequestAuthenticator = (
  request: Request | undefined,
) => Promise<AuthenticatedSupabaseRequest>;

export async function handleGetSellerClassifierThumbnail(
  request: Request,
  workflowId: string,
  imageId: string,
  injectedService?: Pick<SellerClassifierReviewService, "getThumbnail">,
  authenticate: SellerClassifierRequestAuthenticator = authenticateSupabaseRequest,
): Promise<Response> {
  const disabled = classifierAssistedUploadGateResponse();
  if (disabled) return disabled;
  try {
    const context = await authenticate(request);
    const parsedWorkflowId = identifier.parse(workflowId);
    const parsedImageId = identifier.parse(imageId);
    const sellerId = await getCurrentSellerId(context);
    if (!sellerId) throw workflowNotFound();

    const service = injectedService ?? (await getReviewService());
    const bytes = await service.getThumbnail(parsedWorkflowId, parsedImageId, sellerId);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...noStoreHeaders,
        "Content-Type": "image/jpeg",
      },
    });
  } catch (error) {
    if (error instanceof SupabaseAuthenticationError) {
      return errorResponse(error.statusCode, error.code, error.message);
    }
    if (error instanceof z.ZodError) {
      return errorResponse(
        400,
        "seller_classifier_review_invalid",
        "The classifier thumbnail request is invalid.",
      );
    }
    if (error instanceof SellerClassifierBatchError) {
      return errorResponse(error.statusCode, error.code, error.message);
    }
    if (
      error instanceof Error &&
      (error.message.startsWith("seller_classifier_configuration_invalid:") ||
        error.message.startsWith("Missing Supabase environment variable"))
    ) {
      return errorResponse(
        500,
        "seller_classifier_configuration_invalid",
        "Seller classifier workflows are not configured.",
      );
    }
    console.error("[Seller classifier thumbnail] Request failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    return errorResponse(
      503,
      "seller_classifier_unavailable",
      "The classifier is temporarily unavailable.",
    );
  }
}

async function getReviewService(): Promise<SellerClassifierReviewService> {
  const { getSellerClassifierReviewService } = await import("./seller-classifier-batch.runtime");
  return getSellerClassifierReviewService();
}

function workflowNotFound(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    404,
    "seller_classifier_batch_not_found",
    "The classifier workflow was not found.",
  );
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { detail: { code, message } },
    {
      status,
      headers: noStoreHeaders,
    },
  );
}
