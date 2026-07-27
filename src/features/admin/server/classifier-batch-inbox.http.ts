import type { ClassifierBatchInboxReader } from "./classifier-batch-inbox.service";
import {
  classifierImportAccessErrorResponse,
  classifierImportApiErrorResponse,
} from "./classifier-import.http";
import { getClassifierBatchInboxService } from "./classifier-import.runtime";
import { ClassifierImportApiError } from "./classifier-import.types";
import {
  authenticatePrototypeAdministratorRequest,
  type PrototypeAdministratorRequestAuthenticator,
} from "./prototype-administrator-auth";

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

export async function handleListClassifierBatches(
  request: Request,
  service?: ClassifierBatchInboxReader,
  authenticate: PrototypeAdministratorRequestAuthenticator = authenticatePrototypeAdministratorRequest,
): Promise<Response> {
  try {
    await authenticate(request);
    const pagination = parsePagination(request.url);
    const reader = service ?? (await getClassifierBatchInboxService());
    return json(await reader.list(pagination), 200);
  } catch (error) {
    const accessResponse = classifierImportAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof ClassifierImportApiError) {
      return classifierImportApiErrorResponse(error);
    }
    if (
      error instanceof Error &&
      error.message.startsWith("Invalid classifier import configuration:")
    ) {
      return classifierImportApiErrorResponse(
        new ClassifierImportApiError(
          500,
          "classifier_import_configuration_invalid",
          "Classifier import is not configured.",
        ),
      );
    }

    console.error(error);
    return classifierImportApiErrorResponse(
      new ClassifierImportApiError(
        500,
        "classifier_batch_inbox_unavailable",
        "Approved classifier batches are temporarily unavailable.",
      ),
    );
  }
}

function parsePagination(urlValue: string): { limit: number; cursor?: string } {
  const search = new URL(urlValue).searchParams;
  if (search.getAll("limit").length > 1 || search.getAll("cursor").length > 1) {
    throw invalidRequest();
  }

  const rawLimit = search.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (
    (rawLimit !== null && !/^\d+$/.test(rawLimit)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw invalidRequest();
  }

  const cursor = search.get("cursor");
  if (cursor !== null && cursor.length === 0) throw invalidRequest();
  return cursor === null ? { limit } : { limit, cursor };
}

function invalidRequest(): ClassifierImportApiError {
  return new ClassifierImportApiError(
    400,
    "classifier_batch_inbox_request_invalid",
    "The classifier batch inbox request is invalid.",
  );
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders });
}
