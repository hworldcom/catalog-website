import { z } from "zod";

const timestamp = z.string().datetime({ offset: true }).nullable();

const runSchema = z
  .object({
    batchId: z.string().uuid(),
    runId: z.string().uuid().nullable(),
    status: z.enum(["not_started", "pending", "started", "completed", "failed"]),
    attemptCount: z.number().int().nonnegative(),
    retryable: z.boolean(),
    errorCode: z.string().nullable(),
    createdAt: timestamp,
    startedAt: timestamp,
    completedAt: timestamp,
  })
  .strict();

const errorSchema = z
  .object({
    detail: z
      .object({
        code: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ClassifierMultimodalComparisonRun = z.infer<typeof runSchema>;
export type ClassifierMultimodalComparisonOperation = "dispatch_comparison" | "read_comparison";
export type ClassifierMultimodalComparisonFailureKind = "http" | "transport" | "invalid_response";

export class ClassifierMultimodalComparisonClientError extends Error {
  constructor(
    public readonly operation: ClassifierMultimodalComparisonOperation,
    public readonly failureKind: ClassifierMultimodalComparisonFailureKind,
    public readonly statusCode: number | null,
    public readonly classifierCode: string | null,
  ) {
    super("The classifier multimodal comparison request failed.");
    this.name = "ClassifierMultimodalComparisonClientError";
  }
}

export interface ClassifierMultimodalComparisonClient {
  dispatch(batchId: string): Promise<ClassifierMultimodalComparisonRun>;
  getStatus(batchId: string): Promise<ClassifierMultimodalComparisonRun>;
}

export type HttpClassifierMultimodalComparisonClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

export class HttpClassifierMultimodalComparisonClient implements ClassifierMultimodalComparisonClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: HttpClassifierMultimodalComparisonClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  dispatch(batchId: string): Promise<ClassifierMultimodalComparisonRun> {
    return this.request(
      "dispatch_comparison",
      `/v1/upload-batches/${encodeURIComponent(batchId)}/multimodal-comparison-runs`,
      { method: "POST" },
    );
  }

  getStatus(batchId: string): Promise<ClassifierMultimodalComparisonRun> {
    return this.request(
      "read_comparison",
      `/v1/upload-batches/${encodeURIComponent(batchId)}/multimodal-comparison-runs/current`,
    );
  }

  private async request(
    operation: ClassifierMultimodalComparisonOperation,
    path: string,
    init?: RequestInit,
  ): Promise<ClassifierMultimodalComparisonRun> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetchImplementation(new URL(path, this.options.baseUrl), {
          ...init,
          headers: {
            Accept: "application/json",
            ...headersRecord(init?.headers),
          },
          signal: controller.signal,
        });
      } catch {
        throw new ClassifierMultimodalComparisonClientError(operation, "transport", null, null);
      }

      if (!response.ok) throw await responseError(operation, response);

      const parsed = runSchema.safeParse(await readJson(response));
      if (!parsed.success) {
        throw new ClassifierMultimodalComparisonClientError(
          operation,
          "invalid_response",
          null,
          null,
        );
      }
      return parsed.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function responseError(
  operation: ClassifierMultimodalComparisonOperation,
  response: Response,
): Promise<ClassifierMultimodalComparisonClientError> {
  const parsed = errorSchema.safeParse(await readJson(response));
  return new ClassifierMultimodalComparisonClientError(
    operation,
    "http",
    response.status,
    parsed.success ? (parsed.data.detail?.code ?? null) : null,
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}
