import { z } from "zod";

import { ClassifierImportApiError } from "./classifier-import.types";

const approvedBatchSchema = z.object({
  batchId: z.string().uuid(),
  status: z.literal("approved"),
  pipelineVersion: z.string().trim().min(1),
  createdAt: z.string().datetime({ offset: true }),
  finalizedAt: z.string().datetime({ offset: true }).nullable(),
  originalFileCount: z.number().int().nonnegative(),
  processedFileCount: z.number().int().nonnegative(),
  groupCount: z.number().int().nonnegative(),
});

const approvedBatchPageSchema = z.object({
  organizationId: z.string().uuid(),
  items: z.array(approvedBatchSchema),
  nextCursor: z.string().min(1).nullable(),
});

const classifierErrorSchema = z.object({
  detail: z.object({ code: z.string() }),
});

export type ApprovedBatch = z.infer<typeof approvedBatchSchema>;
export type ApprovedBatchPage = z.infer<typeof approvedBatchPageSchema>;

export type ApprovedBatchPageRequest = {
  limit: number;
  cursor?: string;
};

export type ApprovedBatchClientOptions = {
  baseUrl: string;
  organizationId: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

export interface ApprovedBatchReader {
  listApprovedBatches(request: ApprovedBatchPageRequest): Promise<ApprovedBatchPage>;
}

export class ApprovedBatchClient implements ApprovedBatchReader {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: ApprovedBatchClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async listApprovedBatches(request: ApprovedBatchPageRequest): Promise<ApprovedBatchPage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const url = new URL("/v1/upload-batches", this.options.baseUrl);
    url.searchParams.set("status", "approved");
    url.searchParams.set("limit", String(request.limit));
    if (request.cursor !== undefined) url.searchParams.set("cursor", request.cursor);

    try {
      const response = await this.fetchImplementation(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) await this.throwResponseError(response);

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw inboxUnavailable();
        throw inboxResponseInvalid();
      }

      const parsed = approvedBatchPageSchema.safeParse(payload);
      if (!parsed.success || parsed.data.organizationId !== this.options.organizationId) {
        throw inboxResponseInvalid();
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ClassifierImportApiError) throw error;
      throw inboxUnavailable();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async throwResponseError(response: Response): Promise<never> {
    if (response.status >= 500) throw inboxUnavailable();

    if (response.status >= 400 && response.status < 500) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw inboxResponseInvalid();
      }
      const parsed = classifierErrorSchema.safeParse(payload);
      if (parsed.success) {
        if (parsed.data.detail.code === "approved_groups_export_disabled") {
          throw inboxUnavailable();
        }
        if (parsed.data.detail.code === "approved_batch_cursor_invalid") {
          throw new ClassifierImportApiError(
            400,
            "classifier_batch_inbox_request_invalid",
            "The classifier batch inbox request is invalid.",
          );
        }
      }
    }

    throw inboxResponseInvalid();
  }
}

function inboxUnavailable(): ClassifierImportApiError {
  return new ClassifierImportApiError(
    503,
    "classifier_batch_inbox_unavailable",
    "Approved classifier batches are temporarily unavailable.",
  );
}

function inboxResponseInvalid(): ClassifierImportApiError {
  return new ClassifierImportApiError(
    502,
    "classifier_batch_inbox_response_invalid",
    "The classifier returned an invalid approved-batch response.",
  );
}
