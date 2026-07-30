import { z } from "zod";

// This adapter calls the classifier from the website server runtime.
const responseSchema = z
  .object({
    batchId: z.string().uuid(),
    status: z.string().trim().min(1),
    created: z.boolean(),
    maxFiles: z.number().int().positive(),
    maxFileSizeBytes: z.number().int().positive(),
  })
  .strict();

export type ClassifierBatchProvisioningResult = z.infer<typeof responseSchema>;

export class ClassifierBatchProvisioningClientError extends Error {
  constructor(public readonly retryable: boolean) {
    super("The classifier batch could not be provisioned.");
    this.name = "ClassifierBatchProvisioningClientError";
  }
}

export type ClassifierBatchProvisioningClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

export interface ClassifierBatchProvisioner {
  createBatch(idempotencyKey: string): Promise<ClassifierBatchProvisioningResult>;
}

export class ClassifierBatchProvisioningClient implements ClassifierBatchProvisioner {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: ClassifierBatchProvisioningClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async createBatch(idempotencyKey: string): Promise<ClassifierBatchProvisioningResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetchImplementation(
        new URL("/v1/upload-batches", this.options.baseUrl),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new ClassifierBatchProvisioningClientError(
          response.status === 429 || response.status >= 500,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ClassifierBatchProvisioningClientError(false);
      }

      const result = responseSchema.safeParse(payload);
      if (!result.success) throw new ClassifierBatchProvisioningClientError(false);
      return result.data;
    } catch (error) {
      if (error instanceof ClassifierBatchProvisioningClientError) throw error;
      throw new ClassifierBatchProvisioningClientError(true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
