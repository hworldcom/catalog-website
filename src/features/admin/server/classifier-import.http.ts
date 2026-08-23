import { z } from "zod";

import { SupabaseAuthenticationError } from "@/lib/supabase/request-authentication";

import type { ClassifierImportCoordinator } from "./classifier-import.coordinator";
import { ClassifierImportApiError } from "./classifier-import.types";
import { getClassifierImportCoordinator } from "./classifier-import.runtime";
import { PrototypeAdministratorError } from "./prototype-administrator-access";
import {
  authenticatePrototypeAdministratorRequest,
  type PrototypeAdministratorRequestAuthenticator,
} from "./prototype-administrator-auth";

const retryRequestSchema = z.object({
  includeNonRetryable: z.boolean().default(false),
});

const importIdSchema = z.string().uuid();

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

export async function handleGetClassifierImport(
  request: Request,
  importId: string,
  injectedCoordinator?: Pick<ClassifierImportCoordinator, "getStatus">,
  authenticate: PrototypeAdministratorRequestAuthenticator = authenticatePrototypeAdministratorRequest,
): Promise<Response> {
  return handleRequest(request, authenticate, async () => {
    const coordinator = injectedCoordinator ?? (await getClassifierImportCoordinator());
    return json(await coordinator.getStatus(importIdSchema.parse(importId)), 200);
  });
}

export async function handleRetryClassifierImport(
  request: Request,
  importId: string,
  injectedCoordinator?: Pick<ClassifierImportCoordinator, "retry">,
  authenticate: PrototypeAdministratorRequestAuthenticator = authenticatePrototypeAdministratorRequest,
): Promise<Response> {
  return handleRequest(request, authenticate, async () => {
    const text = await request.text();
    const payload = retryRequestSchema.parse(text.trim() ? JSON.parse(text) : {});
    const coordinator = injectedCoordinator ?? (await getClassifierImportCoordinator());
    const result = await coordinator.retry(
      importIdSchema.parse(importId),
      payload.includeNonRetryable,
    );
    return json(result.body, result.httpStatus);
  });
}

export async function handleReconcileClassifierImport(
  request: Request,
  importId: string,
  injectedCoordinator?: Pick<ClassifierImportCoordinator, "reconcile">,
  authenticate: PrototypeAdministratorRequestAuthenticator = authenticatePrototypeAdministratorRequest,
): Promise<Response> {
  return handleRequest(request, authenticate, async () => {
    const coordinator = injectedCoordinator ?? (await getClassifierImportCoordinator());
    const result = await coordinator.reconcile(importIdSchema.parse(importId));
    return json(result.body, result.httpStatus);
  });
}

export async function handleDispatchClassifierImport(
  request: Request,
  importId: string,
  injectedCoordinator?: Pick<ClassifierImportCoordinator, "dispatch">,
  authenticate: PrototypeAdministratorRequestAuthenticator = authenticatePrototypeAdministratorRequest,
): Promise<Response> {
  return handleRequest(request, authenticate, async () => {
    const coordinator = injectedCoordinator ?? (await getClassifierImportCoordinator());
    const result = await coordinator.dispatch(importIdSchema.parse(importId));
    return json(result.body, result.httpStatus);
  });
}

async function handleRequest(
  request: Request,
  authenticate: PrototypeAdministratorRequestAuthenticator,
  operation: () => Promise<Response>,
): Promise<Response> {
  try {
    await authenticate(request);
    return await operation();
  } catch (error) {
    const accessResponse = classifierImportAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof ClassifierImportApiError) {
      return classifierImportApiErrorResponse(error);
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse(
        400,
        "classifier_import_request_invalid",
        "The classifier import request is invalid.",
      );
    }

    console.error(error);
    if (
      error instanceof Error &&
      error.message.startsWith("Invalid classifier import configuration:")
    ) {
      return errorResponse(
        500,
        "classifier_import_configuration_invalid",
        "Classifier import is not configured.",
      );
    }
    return errorResponse(
      500,
      "classifier_import_unavailable",
      "Classifier import is temporarily unavailable.",
    );
  }
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders,
  });
}

export function classifierImportApiErrorResponse(error: ClassifierImportApiError): Response {
  return errorResponse(error.status, error.code, error.message, error.details);
}

export function classifierImportAccessErrorResponse(error: unknown): Response | null {
  if (
    error instanceof SupabaseAuthenticationError ||
    error instanceof PrototypeAdministratorError
  ) {
    return errorResponse(error.statusCode, error.code, error.message);
  }
  return null;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details: { importId?: string } = {},
): Response {
  return json({ detail: { code, message, ...details } }, status);
}
