import { z } from "zod";

import { ClassifierImportError } from "./classifier-import.types";

export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_DRAFT_IMAGE_BUCKET = "product-draft-images";

const productImageStorageBucketSchema = z.enum([PRODUCT_IMAGE_BUCKET, PRODUCT_DRAFT_IMAGE_BUCKET]);

export type ProductImageStorageBucket = z.infer<typeof productImageStorageBucketSchema>;

export type ClassifierImageObjectMetadata = {
  classifierOrganizationId: string;
  classifierBatchId: string;
  classifierGroupId: string;
  classifierImageId: string;
  classifierSourceContentLength: string;
};

export type DestinationObjectInfo = {
  contentType: string | null;
  sizeBytes: number | null;
  metadata: Record<string, unknown>;
};

export type DestinationObject = {
  bytes: Uint8Array;
  contentType: string | null;
};

export interface DestinationImageStorage {
  getInfo(
    storageBucket: ProductImageStorageBucket,
    destinationKey: string,
    signal?: AbortSignal,
  ): Promise<DestinationObjectInfo | null>;
  read(
    storageBucket: ProductImageStorageBucket,
    destinationKey: string,
    signal?: AbortSignal,
  ): Promise<DestinationObject | null>;
  createOnly(input: {
    storageBucket: ProductImageStorageBucket;
    destinationKey: string;
    bytes: Uint8Array;
    contentType: "image/jpeg";
    metadata: ClassifierImageObjectMetadata;
    signal?: AbortSignal;
  }): Promise<"created" | "already_exists">;
  delete(
    storageBucket: ProductImageStorageBucket,
    destinationKey: string,
    signal?: AbortSignal,
  ): Promise<void>;
}

const storageInfoSchema = z.object({
  size: z.number().int().nonnegative().optional(),
  content_type: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type SupabaseDestinationImageStorageOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
  headTimeoutMs: number;
  writeTimeoutMs: number;
  fetchImplementation?: typeof fetch;
};

export class SupabaseDestinationImageStorage implements DestinationImageStorage {
  private readonly fetchImplementation: typeof fetch;
  private readonly storageBaseUrl: string;

  constructor(private readonly options: SupabaseDestinationImageStorageOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.storageBaseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/storage/v1`;
  }

  async getInfo(
    storageBucket: ProductImageStorageBucket,
    destinationKey: string,
    signal?: AbortSignal,
  ): Promise<DestinationObjectInfo | null> {
    const response = await this.fetchWithTimeout(
      `${this.storageBaseUrl}/object/info/${encodePath(storageBucket)}/${encodePath(destinationKey)}`,
      {
        method: "GET",
        headers: this.authorizationHeaders(),
      },
      this.options.headTimeoutMs,
      signal,
    );

    if (await isNotFoundResponse(response)) return null;
    if (!response.ok) {
      await this.throwStorageError(response, "destination_object_conflict");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ClassifierImportError("destination_object_conflict", false);
    }
    const parsed = storageInfoSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ClassifierImportError("destination_object_conflict", false);
    }
    return {
      contentType: parsed.data.content_type ?? null,
      sizeBytes: parsed.data.size ?? null,
      metadata: parsed.data.metadata ?? {},
    };
  }

  async read(
    storageBucket: ProductImageStorageBucket,
    destinationKey: string,
    signal?: AbortSignal,
  ): Promise<DestinationObject | null> {
    const response = await this.fetchWithTimeout(
      `${this.storageBaseUrl}/object/${encodePath(storageBucket)}/${encodePath(destinationKey)}`,
      {
        method: "GET",
        headers: this.authorizationHeaders(),
      },
      this.options.writeTimeoutMs,
      signal,
    );

    if (await isNotFoundResponse(response)) return null;
    if (!response.ok) {
      await this.throwStorageError(response, "destination_object_conflict");
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type"),
    };
  }

  async createOnly(input: {
    storageBucket: ProductImageStorageBucket;
    destinationKey: string;
    bytes: Uint8Array;
    contentType: "image/jpeg";
    metadata: ClassifierImageObjectMetadata;
    signal?: AbortSignal;
  }): Promise<"created" | "already_exists"> {
    const headers = this.authorizationHeaders();
    headers.set("cache-control", "max-age=3600");
    headers.set("content-type", input.contentType);
    headers.set("x-upsert", "false");
    headers.set("x-metadata", encodeMetadata(input.metadata));

    const response = await this.fetchWithTimeout(
      `${this.storageBaseUrl}/object/${encodePath(input.storageBucket)}/${encodePath(
        input.destinationKey,
      )}`,
      {
        method: "POST",
        headers,
        body: input.bytes as BodyInit,
      },
      this.options.writeTimeoutMs,
      input.signal,
    );

    if (response.ok) return "created";
    if (await isDuplicateResponse(response)) return "already_exists";
    return await this.throwStorageError(response, "destination_object_conflict");
  }

  async delete(
    storageBucket: ProductImageStorageBucket,
    destinationKey: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await this.fetchWithTimeout(
      `${this.storageBaseUrl}/object/${encodePath(storageBucket)}`,
      {
        method: "DELETE",
        headers: new Headers({
          ...Object.fromEntries(this.authorizationHeaders()),
          "content-type": "application/json",
        }),
        body: JSON.stringify({ prefixes: [destinationKey] }),
      },
      this.options.writeTimeoutMs,
      signal,
    );

    if (!response.ok) {
      await this.throwStorageError(response, "destination_object_conflict");
    }
  }

  private authorizationHeaders(): Headers {
    const headers = new Headers({ apikey: this.options.serviceRoleKey });
    if (!isOpaqueSupabaseKey(this.options.serviceRoleKey)) {
      headers.set("Authorization", `Bearer ${this.options.serviceRoleKey}`);
    }
    return headers;
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    if (externalSignal?.aborted) controller.abort();
    try {
      return await this.fetchImplementation(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      throw new ClassifierImportError(
        "destination_storage_unavailable",
        true,
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abort);
    }
  }

  private async throwStorageError(response: Response, clientErrorCode: string): Promise<never> {
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw new ClassifierImportError("destination_storage_unavailable", true);
    }
    throw new ClassifierImportError(clientErrorCode, false);
  }
}

export function parseProductImageStorageBucket(value: unknown): ProductImageStorageBucket {
  const parsed = productImageStorageBucketSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("ProductDraft image has an unsupported storage bucket.");
  }
  return parsed.data;
}

function encodePath(value: string): string {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function encodeMetadata(metadata: ClassifierImageObjectMetadata): string {
  return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64");
}

function isOpaqueSupabaseKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

async function isDuplicateResponse(response: Response): Promise<boolean> {
  if (response.status === 409) return true;
  if (response.status !== 400) return false;
  try {
    const payload = (await response.clone().json()) as {
      error?: unknown;
      message?: unknown;
      statusCode?: unknown;
    };
    return [payload.error, payload.message, payload.statusCode].some(
      (value) =>
        typeof value === "string" &&
        (value.toLowerCase().includes("duplicate") ||
          value.toLowerCase().includes("already exists")),
    );
  } catch {
    return false;
  }
}

async function isNotFoundResponse(response: Response): Promise<boolean> {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  try {
    const payload = (await response.clone().json()) as {
      error?: unknown;
      message?: unknown;
      statusCode?: unknown;
    };
    const statusCode =
      typeof payload.statusCode === "number"
        ? payload.statusCode
        : Number.parseInt(String(payload.statusCode), 10);
    return (
      statusCode === 404 &&
      [payload.error, payload.message].some(
        (value) =>
          typeof value === "string" &&
          (value.toLowerCase().includes("not_found") || value.toLowerCase().includes("not found")),
      )
    );
  } catch {
    return false;
  }
}

export function buildDestinationMetadata(input: {
  classifierOrganizationId: string;
  classifierBatchId: string;
  classifierGroupId: string;
  classifierImageId: string;
  sourceContentLength: number;
}): ClassifierImageObjectMetadata {
  return {
    classifierOrganizationId: input.classifierOrganizationId,
    classifierBatchId: input.classifierBatchId,
    classifierGroupId: input.classifierGroupId,
    classifierImageId: input.classifierImageId,
    classifierSourceContentLength: String(input.sourceContentLength),
  };
}

export function destinationObjectMatches(
  info: DestinationObjectInfo,
  expected: {
    contentType: "image/jpeg";
    sizeBytes: number;
    metadata: ClassifierImageObjectMetadata;
  },
): boolean {
  return (
    info.contentType === expected.contentType &&
    info.sizeBytes === expected.sizeBytes &&
    Object.entries(expected.metadata).every(([key, value]) => info.metadata[key] === value)
  );
}
