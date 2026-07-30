import { z } from "zod";

// This adapter is server-only; signed upload object keys never cross into browser state.
const uploadStatusSchema = z.enum([
  "created",
  "uploading",
  "queued",
  "processing",
  "review_required",
  "approved",
  "failed",
  "cancelled",
]);

const imageStatusSchema = z.enum(["pending", "uploaded", "processing", "processed", "failed"]);

const registeredUploadSchema = z
  .object({
    imageId: z.string().uuid(),
    uploadOrder: z.number().int().nonnegative(),
    originalFilename: z.string(),
    originalObjectKey: z.string().min(1),
    uploadUrl: z.string().url(),
  })
  .strict();

const registrationSchema = z
  .object({
    batchId: z.string().uuid(),
    status: z.literal("uploading"),
    uploads: z.array(registeredUploadSchema),
  })
  .strict();

const uploadSnapshotSchema = z
  .object({
    batchId: z.string().uuid(),
    status: uploadStatusSchema,
    originalFileCount: z.number().int().nonnegative(),
    processedFileCount: z.number().int().nonnegative(),
    createdAt: z.string().min(1),
    finalizedAt: z.string().min(1).nullable(),
    completedAt: z.string().min(1).nullable(),
    images: z.array(
      z
        .object({
          imageId: z.string().uuid(),
          uploadOrder: z.number().int().nonnegative(),
          originalFilename: z.string(),
          status: imageStatusSchema,
          errorCode: z.string().nullable(),
          errorMessage: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

const processingSnapshotSchema = z
  .object({
    batchId: z.string().uuid(),
    status: z.enum(["queued", "processing", "review_required", "approved", "failed", "cancelled"]),
    originalFileCount: z.number().int().nonnegative(),
    processedFileCount: z.number().int().nonnegative(),
    pipelineVersion: z.string().min(1),
    images: z.array(
      z
        .object({
          imageId: z.string().uuid(),
          uploadOrder: z.number().int().nonnegative(),
          originalFilename: z.string(),
          imageStatus: imageStatusSchema,
          processJobStatus: z.string().nullable(),
          processError: z.string().nullable(),
          classifyJobStatus: z.string().nullable(),
          classifyError: z.string().nullable(),
          categorySlug: z.string().nullable(),
          confidence: z.number().finite().nullable(),
          hasHashes: z.boolean(),
          hasEmbedding: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

const errorSchema = z
  .object({
    detail: z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ClassifierUploadRegistration = z.infer<typeof registrationSchema>;
export type ClassifierUploadSnapshot = z.infer<typeof uploadSnapshotSchema>;
export type ClassifierProcessingSnapshot = z.infer<typeof processingSnapshotSchema>;

export type ClassifierWorkflowOperation =
  "register" | "retry_upload" | "read_upload" | "finalize" | "start_processing" | "read_processing";

export class ClassifierWorkflowClientError extends Error {
  constructor(
    public readonly operation: ClassifierWorkflowOperation,
    public readonly statusCode: number | null,
    public readonly classifierCode: string | null,
  ) {
    super("The classifier workflow request failed.");
    this.name = "ClassifierWorkflowClientError";
  }
}

export interface ClassifierWorkflowClient {
  registerUploads(
    batchId: string,
    files: {
      originalFilename: string;
      mimeType: "image/jpeg";
      sizeBytes: number;
    }[],
  ): Promise<ClassifierUploadRegistration>;
  retryUploads(batchId: string, imageIds: string[]): Promise<ClassifierUploadRegistration>;
  getUpload(batchId: string): Promise<ClassifierUploadSnapshot>;
  finalize(batchId: string): Promise<ClassifierUploadSnapshot>;
  startProcessing(batchId: string): Promise<ClassifierProcessingSnapshot>;
  getProcessing(batchId: string): Promise<ClassifierProcessingSnapshot>;
}

export type HttpClassifierWorkflowClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

export class HttpClassifierWorkflowClient implements ClassifierWorkflowClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: HttpClassifierWorkflowClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  registerUploads(
    batchId: string,
    files: {
      originalFilename: string;
      mimeType: "image/jpeg";
      sizeBytes: number;
    }[],
  ): Promise<ClassifierUploadRegistration> {
    return this.request(
      "register",
      `/v1/upload-batches/${encodeURIComponent(batchId)}/uploads`,
      registrationSchema,
      jsonRequest({ files }),
    );
  }

  retryUploads(batchId: string, imageIds: string[]): Promise<ClassifierUploadRegistration> {
    return this.request(
      "retry_upload",
      `/v1/upload-batches/${encodeURIComponent(batchId)}/retry-failed`,
      registrationSchema,
      jsonRequest({ imageIds }),
    );
  }

  getUpload(batchId: string): Promise<ClassifierUploadSnapshot> {
    return this.request(
      "read_upload",
      `/v1/upload-batches/${encodeURIComponent(batchId)}`,
      uploadSnapshotSchema,
    );
  }

  finalize(batchId: string): Promise<ClassifierUploadSnapshot> {
    return this.request(
      "finalize",
      `/v1/upload-batches/${encodeURIComponent(batchId)}/finalize`,
      uploadSnapshotSchema,
      { method: "POST" },
    );
  }

  startProcessing(batchId: string): Promise<ClassifierProcessingSnapshot> {
    return this.request(
      "start_processing",
      `/v1/upload-batches/${encodeURIComponent(batchId)}/start-processing`,
      processingSnapshotSchema,
      { method: "POST" },
    );
  }

  getProcessing(batchId: string): Promise<ClassifierProcessingSnapshot> {
    return this.request(
      "read_processing",
      `/v1/upload-batches/${encodeURIComponent(batchId)}/processing`,
      processingSnapshotSchema,
    );
  }

  private async request<T>(
    operation: ClassifierWorkflowOperation,
    path: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetchImplementation(new URL(path, this.options.baseUrl), {
        ...init,
        headers: {
          Accept: "application/json",
          ...headersRecord(init?.headers),
        },
        signal: controller.signal,
      });
      const payload = await readJson(response);

      if (!response.ok) {
        const parsedError = errorSchema.safeParse(payload);
        throw new ClassifierWorkflowClientError(
          operation,
          response.status,
          parsedError.success ? (parsedError.data.detail?.code ?? null) : null,
        );
      }

      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new ClassifierWorkflowClientError(operation, null, null);
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ClassifierWorkflowClientError) throw error;
      throw new ClassifierWorkflowClientError(operation, null, null);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function jsonRequest(payload: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
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
