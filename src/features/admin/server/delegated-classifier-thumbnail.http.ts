import { z } from "zod";
import { classifierAssistedUploadGateResponse } from "@/features/classifier-release/server/classifier-assisted-upload-gate";

import {
  DelegatedClassifierContinuationError,
  delegatedReviewInvalid,
} from "../delegated-classifier-review-import.types";
import { DelegatedClassifierUploadError } from "../delegated-classifier-upload.types";
import {
  authenticatePrototypeAdministratorRequest,
  type PrototypeAdministratorRequestAuthenticator,
} from "./prototype-administrator-auth";
import { PrototypeAdministratorError } from "./prototype-administrator-access";
import type { DelegatedClassifierReviewImportService } from "./delegated-classifier-review-import.service";
import { SupabaseAuthenticationError } from "@/lib/supabase/request-authentication";

const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const noStoreHeaders = { "Cache-Control": "no-store" };

export async function handleGetDelegatedClassifierThumbnail(
  request: Request,
  workflowId: string,
  imageId: string,
  injectedService?: Pick<DelegatedClassifierReviewImportService, "getThumbnail">,
  authenticate: PrototypeAdministratorRequestAuthenticator = authenticatePrototypeAdministratorRequest,
): Promise<Response> {
  const disabled = classifierAssistedUploadGateResponse();
  if (disabled) return disabled;
  try {
    const parsedWorkflowId = identifier.parse(workflowId);
    const parsedImageId = identifier.parse(imageId);
    await authenticate(request);
    const service = injectedService ?? (await getContinuationService());
    const bytes = await service.getThumbnail(parsedWorkflowId, parsedImageId);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...noStoreHeaders,
        "Content-Type": "image/jpeg",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const invalid = delegatedReviewInvalid();
      return errorResponse(invalid.statusCode, invalid.code, invalid.message);
    }
    if (
      error instanceof SupabaseAuthenticationError ||
      error instanceof PrototypeAdministratorError ||
      error instanceof DelegatedClassifierContinuationError ||
      error instanceof DelegatedClassifierUploadError
    ) {
      return errorResponse(error.statusCode, error.code, error.message);
    }
    console.error("[Delegated classifier thumbnail] Request failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    return errorResponse(
      503,
      "delegated_classifier_unavailable",
      "The classifier is temporarily unavailable.",
    );
  }
}

async function getContinuationService(): Promise<DelegatedClassifierReviewImportService> {
  const { getDelegatedClassifierReviewImportService } =
    await import("./delegated-classifier-review-import.runtime");
  return getDelegatedClassifierReviewImportService();
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
