import { z } from "zod";

import { ClassifierImportError } from "./classifier-import.types";

const classifierErrorSchema = z.object({
  detail: z.object({
    code: z.string(),
  }),
});

const knownClientErrors: Record<string, { code: string; retryable: boolean }> = {
  approved_image_export_disabled: {
    code: "approved_image_export_disabled",
    retryable: false,
  },
  approved_image_not_found: {
    code: "classifier_image_not_found",
    retryable: false,
  },
  approved_image_not_approved: {
    code: "classifier_image_not_approved",
    retryable: false,
  },
  approved_image_unavailable: {
    code: "classifier_image_unavailable",
    retryable: true,
  },
};

export type NormalizedClassifierImage = {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  contentLength: number;
};

export interface NormalizedClassifierImageReader {
  readNormalizedImage(input: {
    batchId: string;
    groupId: string;
    imageId: string;
  }): Promise<NormalizedClassifierImage>;
}

export type ClassifierNormalizedImageClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

export class ClassifierNormalizedImageClient implements NormalizedClassifierImageReader {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: ClassifierNormalizedImageClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async readNormalizedImage(input: {
    batchId: string;
    groupId: string;
    imageId: string;
  }): Promise<NormalizedClassifierImage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetchImplementation(
        `${this.options.baseUrl}/internal/v1/export/batches/${encodeURIComponent(
          input.batchId,
        )}/groups/${encodeURIComponent(input.groupId)}/images/${encodeURIComponent(
          input.imageId,
        )}/normalized`,
        {
          method: "GET",
          headers: { Accept: "image/jpeg" },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        await this.throwResponseError(response, controller.signal);
      }

      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
      const contentLengthValue = response.headers.get("content-length");
      const contentLength =
        contentLengthValue && /^\d+$/.test(contentLengthValue)
          ? Number(contentLengthValue)
          : Number.NaN;
      if (
        contentType !== "image/jpeg" ||
        !Number.isSafeInteger(contentLength) ||
        contentLength <= 0
      ) {
        throw new ClassifierImportError("classifier_image_response_invalid", false);
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ClassifierImportError(
            "classifier_image_request_failed",
            true,
            error instanceof Error ? error.message : undefined,
          );
        }
        throw new ClassifierImportError("classifier_image_response_invalid", false);
      }

      if (bytes.byteLength !== contentLength) {
        throw new ClassifierImportError("classifier_image_response_invalid", false);
      }
      return { bytes, contentType: "image/jpeg", contentLength };
    } catch (error) {
      if (error instanceof ClassifierImportError) throw error;
      throw new ClassifierImportError(
        "classifier_image_request_failed",
        true,
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async throwResponseError(response: Response, signal: AbortSignal): Promise<never> {
    if (response.status >= 500) {
      throw new ClassifierImportError("classifier_image_request_failed", true);
    }

    if (response.status >= 400 && response.status < 500) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        if (signal.aborted) {
          throw new ClassifierImportError(
            "classifier_image_request_failed",
            true,
            error instanceof Error ? error.message : undefined,
          );
        }
        throw new ClassifierImportError("classifier_image_unexpected_client_error", false);
      }
      const parsed = classifierErrorSchema.safeParse(payload);
      const mapped = parsed.success ? knownClientErrors[parsed.data.detail.code] : undefined;
      throw new ClassifierImportError(
        mapped?.code ?? "classifier_image_unexpected_client_error",
        mapped?.retryable ?? false,
      );
    }

    throw new ClassifierImportError("classifier_image_response_invalid", false);
  }
}
