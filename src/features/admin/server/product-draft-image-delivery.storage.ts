import { z } from "zod";

import type { DestinationObjectInfo } from "./destination-image-storage";

export type ProductDraftImageDeliveryStorageFailure =
  "object_missing" | "object_conflict" | "signing_rejected" | "service_unavailable";

export class ProductDraftImageDeliveryStorageError extends Error {
  constructor(
    public readonly failure: ProductDraftImageDeliveryStorageFailure,
    message: string,
  ) {
    super(message);
    this.name = "ProductDraftImageDeliveryStorageError";
  }
}

export interface ProductDraftImageDeliveryStorage {
  getInfo(destinationKey: string, signal: AbortSignal): Promise<DestinationObjectInfo | null>;
  createSignedUrl(
    destinationKey: string,
    expiresInSeconds: number,
    signal: AbortSignal,
  ): Promise<string>;
}

export type SupabaseProductDraftImageDeliveryStorageOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImplementation?: typeof fetch;
};

const objectInfoSchema = z.object({
  size: z.number().int().nonnegative().optional(),
  content_type: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const signedUrlSchema = z.object({
  signedURL: z.string().min(1),
});

export class SupabaseProductDraftImageDeliveryStorage implements ProductDraftImageDeliveryStorage {
  private readonly fetchImplementation: typeof fetch;
  private readonly storageBaseUrl: string;

  constructor(private readonly options: SupabaseProductDraftImageDeliveryStorageOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.storageBaseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/storage/v1`;
  }

  async getInfo(
    destinationKey: string,
    signal: AbortSignal,
  ): Promise<DestinationObjectInfo | null> {
    const response = await this.request(
      `${this.storageBaseUrl}/object/info/product-draft-images/${encodePath(destinationKey)}`,
      {
        method: "GET",
        headers: this.authorizationHeaders(),
        signal,
      },
    );
    if (await isNotFoundResponse(response)) return null;
    if (!response.ok) {
      throw new ProductDraftImageDeliveryStorageError(
        isRequestLevelFailure(response) ? "service_unavailable" : "object_conflict",
        "The private ProductDraft image could not be verified.",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw objectConflict();
    }
    const parsed = objectInfoSchema.safeParse(payload);
    if (!parsed.success) throw objectConflict();
    return {
      contentType: parsed.data.content_type ?? null,
      sizeBytes: parsed.data.size ?? null,
      metadata: parsed.data.metadata ?? {},
    };
  }

  async createSignedUrl(
    destinationKey: string,
    expiresInSeconds: number,
    signal: AbortSignal,
  ): Promise<string> {
    const response = await this.request(
      `${this.storageBaseUrl}/object/sign/product-draft-images/${encodePath(destinationKey)}`,
      {
        method: "POST",
        headers: new Headers({
          ...Object.fromEntries(this.authorizationHeaders()),
          "content-type": "application/json",
        }),
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
        signal,
      },
    );
    if (await isNotFoundResponse(response)) {
      throw new ProductDraftImageDeliveryStorageError(
        "object_missing",
        "The private ProductDraft image does not exist.",
      );
    }
    if (!response.ok) {
      throw new ProductDraftImageDeliveryStorageError(
        isRequestLevelFailure(response) ? "service_unavailable" : "signing_rejected",
        "The private ProductDraft image could not be signed.",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw signingRejected();
    }
    const parsed = signedUrlSchema.safeParse(payload);
    if (!parsed.success) throw signingRejected();

    const signedUrl = resolveSignedUrl(this.storageBaseUrl, parsed.data.signedURL);
    if (signedUrl.includes(this.options.serviceRoleKey)) throw signingRejected();
    return signedUrl;
  }

  private authorizationHeaders(): Headers {
    const headers = new Headers({ apikey: this.options.serviceRoleKey });
    if (!isOpaqueSupabaseKey(this.options.serviceRoleKey)) {
      headers.set("Authorization", `Bearer ${this.options.serviceRoleKey}`);
    }
    return headers;
  }

  private async request(input: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImplementation(input, init);
    } catch {
      throw new ProductDraftImageDeliveryStorageError(
        "service_unavailable",
        "The private ProductDraft image storage service is unavailable.",
      );
    }
  }
}

function objectConflict(): ProductDraftImageDeliveryStorageError {
  return new ProductDraftImageDeliveryStorageError(
    "object_conflict",
    "The private ProductDraft image metadata is invalid.",
  );
}

function signingRejected(): ProductDraftImageDeliveryStorageError {
  return new ProductDraftImageDeliveryStorageError(
    "signing_rejected",
    "The private ProductDraft image signing response is invalid.",
  );
}

function resolveSignedUrl(storageBaseUrl: string, value: string): string {
  let resolved: URL;
  try {
    resolved = new URL(
      value.startsWith("http://") || value.startsWith("https://")
        ? value
        : `${storageBaseUrl}${value.startsWith("/") ? "" : "/"}${value}`,
    );
  } catch {
    throw signingRejected();
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw signingRejected();
  }
  return encodeURI(resolved.toString());
}

function encodePath(value: string): string {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isOpaqueSupabaseKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function isRequestLevelFailure(response: Response): boolean {
  return (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500
  );
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
