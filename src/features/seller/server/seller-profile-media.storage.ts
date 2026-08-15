import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/lib/supabase/types";

import { SELLER_PROFILE_IMAGE_BUCKET } from "../seller-profile-media.types";

export type SellerProfileStoredImage = {
  contentType: string | null;
  sizeBytes: number | null;
  bytes: Uint8Array;
};

export interface SellerProfileMediaStorage {
  createSignedUpload(path: string): Promise<{ path: string; token: string }>;
  read(path: string, signal: AbortSignal): Promise<SellerProfileStoredImage | null>;
  delete(path: string, signal: AbortSignal): Promise<void>;
}

export class SellerProfileMediaStorageError extends Error {
  constructor(message = "Seller profile image storage is unavailable.") {
    super(message);
    this.name = "SellerProfileMediaStorageError";
  }
}

type AdminClient = SupabaseClient<Database>;

const objectInfoSchema = z.object({
  size: z.number().int().nonnegative().optional(),
  content_type: z.string().nullable().optional(),
});

export class SupabaseSellerProfileMediaStorage implements SellerProfileMediaStorage {
  private readonly fetchImplementation: typeof fetch;
  private readonly storageBaseUrl: string;

  constructor(
    private readonly options: {
      database: AdminClient;
      supabaseUrl: string;
      serviceRoleKey: string;
      fetchImplementation?: typeof fetch;
    },
  ) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.storageBaseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/storage/v1`;
  }

  async createSignedUpload(path: string): Promise<{ path: string; token: string }> {
    const response = await this.options.database.storage
      .from(SELLER_PROFILE_IMAGE_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (response.error || !response.data.token || response.data.path !== path) {
      throw new SellerProfileMediaStorageError();
    }
    return { path, token: response.data.token };
  }

  async read(path: string, signal: AbortSignal): Promise<SellerProfileStoredImage | null> {
    const infoResponse = await this.request(
      `${this.storageBaseUrl}/object/info/${SELLER_PROFILE_IMAGE_BUCKET}/${encodePath(path)}`,
      { method: "GET", headers: this.authorizationHeaders(), signal },
    );
    if (await isNotFoundResponse(infoResponse)) return null;
    if (!infoResponse.ok) throw new SellerProfileMediaStorageError();

    let infoPayload: unknown;
    try {
      infoPayload = await infoResponse.json();
    } catch {
      throw new SellerProfileMediaStorageError();
    }
    const info = objectInfoSchema.safeParse(infoPayload);
    if (!info.success) throw new SellerProfileMediaStorageError();

    const objectResponse = await this.request(
      `${this.storageBaseUrl}/object/${SELLER_PROFILE_IMAGE_BUCKET}/${encodePath(path)}`,
      { method: "GET", headers: this.authorizationHeaders(), signal },
    );
    if (await isNotFoundResponse(objectResponse)) return null;
    if (!objectResponse.ok) throw new SellerProfileMediaStorageError();

    return {
      contentType: normalizeContentType(info.data.content_type ?? null),
      sizeBytes: info.data.size ?? null,
      bytes: new Uint8Array(await objectResponse.arrayBuffer()),
    };
  }

  async delete(path: string, signal: AbortSignal): Promise<void> {
    const response = await this.request(
      `${this.storageBaseUrl}/object/${SELLER_PROFILE_IMAGE_BUCKET}`,
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
    if (!response.ok) throw new SellerProfileMediaStorageError();
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
      throw new SellerProfileMediaStorageError();
    }
  }
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
