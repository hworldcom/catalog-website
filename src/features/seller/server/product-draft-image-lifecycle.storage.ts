import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/lib/supabase/types";

import type { ProductDraftImageContentType } from "../product-draft-image-lifecycle.types";

const PRODUCT_DRAFT_IMAGE_BUCKET = "product-draft-images";

export type ProductDraftImageStoredObject = {
  contentType: string | null;
  sizeBytes: number | null;
  signatureBytes: Uint8Array;
};

export type ProductDraftImageSignedUpload = {
  path: string;
  token: string;
};

export interface ProductDraftImageLifecycleStorage {
  createSignedUpload(path: string): Promise<ProductDraftImageSignedUpload>;
  inspect(path: string, signal: AbortSignal): Promise<ProductDraftImageStoredObject | null>;
  delete(path: string, signal: AbortSignal): Promise<void>;
}

export class ProductDraftImageLifecycleStorageError extends Error {
  constructor(
    public readonly failure: "unavailable" | "invalid_response",
    message = "ProductDraft image storage operation failed.",
  ) {
    super(message);
    this.name = "ProductDraftImageLifecycleStorageError";
  }
}

type AdminClient = SupabaseClient<Database>;

type SupabaseProductDraftImageLifecycleStorageOptions = {
  database: AdminClient;
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImplementation?: typeof fetch;
};

const objectInfoSchema = z.object({
  size: z.number().int().nonnegative().optional(),
  content_type: z.string().nullable().optional(),
});

export class SupabaseProductDraftImageLifecycleStorage implements ProductDraftImageLifecycleStorage {
  private readonly fetchImplementation: typeof fetch;
  private readonly storageBaseUrl: string;

  constructor(private readonly options: SupabaseProductDraftImageLifecycleStorageOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.storageBaseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/storage/v1`;
  }

  async createSignedUpload(path: string): Promise<ProductDraftImageSignedUpload> {
    const response = await this.options.database.storage
      .from(PRODUCT_DRAFT_IMAGE_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (response.error) {
      throw new ProductDraftImageLifecycleStorageError(
        "unavailable",
        "A signed ProductDraft image upload could not be created.",
      );
    }
    if (!response.data.token || response.data.path !== path) {
      throw new ProductDraftImageLifecycleStorageError("invalid_response");
    }
    return { path, token: response.data.token };
  }

  async inspect(path: string, signal: AbortSignal): Promise<ProductDraftImageStoredObject | null> {
    const infoResponse = await this.request(
      `${this.storageBaseUrl}/object/info/${PRODUCT_DRAFT_IMAGE_BUCKET}/${encodePath(path)}`,
      { method: "GET", headers: this.authorizationHeaders(), signal },
    );
    if (await isNotFoundResponse(infoResponse)) return null;
    if (!infoResponse.ok) throw storageUnavailable();

    let infoPayload: unknown;
    try {
      infoPayload = await infoResponse.json();
    } catch {
      throw new ProductDraftImageLifecycleStorageError("invalid_response");
    }
    const info = objectInfoSchema.safeParse(infoPayload);
    if (!info.success) throw new ProductDraftImageLifecycleStorageError("invalid_response");

    const bytesResponse = await this.request(
      `${this.storageBaseUrl}/object/${PRODUCT_DRAFT_IMAGE_BUCKET}/${encodePath(path)}`,
      {
        method: "GET",
        headers: new Headers({
          ...Object.fromEntries(this.authorizationHeaders()),
          range: "bytes=0-15",
        }),
        signal,
      },
    );
    if (await isNotFoundResponse(bytesResponse)) return null;
    if (!bytesResponse.ok) throw storageUnavailable();

    return {
      contentType: normalizeContentType(info.data.content_type ?? null),
      sizeBytes: info.data.size ?? null,
      signatureBytes: new Uint8Array(await bytesResponse.arrayBuffer()).slice(0, 16),
    };
  }

  async delete(path: string, signal: AbortSignal): Promise<void> {
    const response = await this.request(
      `${this.storageBaseUrl}/object/${PRODUCT_DRAFT_IMAGE_BUCKET}`,
      {
        method: "DELETE",
        headers: new Headers({
          ...Object.fromEntries(this.authorizationHeaders()),
          "content-type": "application/json",
        }),
        body: JSON.stringify({ prefixes: [path] }),
        signal,
      },
    );
    if (!response.ok) throw storageUnavailable();
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
      throw storageUnavailable();
    }
  }
}

export function hasMatchingImageSignature(
  contentType: ProductDraftImageContentType,
  bytes: Uint8Array,
): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function normalizeContentType(value: string | null): string | null {
  return value?.split(";", 1)[0]?.trim().toLowerCase() || null;
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

function storageUnavailable(): ProductDraftImageLifecycleStorageError {
  return new ProductDraftImageLifecycleStorageError("unavailable");
}

async function isNotFoundResponse(response: Response): Promise<boolean> {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  try {
    const payload = (await response.clone().json()) as { statusCode?: unknown };
    return Number.parseInt(String(payload.statusCode), 10) === 404;
  } catch {
    return false;
  }
}
