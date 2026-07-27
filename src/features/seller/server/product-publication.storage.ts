export type ProductPublicationStorageBucket = "product-draft-images" | "product-images";

export type ProductPublicationObject = {
  bytes: Uint8Array;
  contentType: string | null;
  etag: string | null;
};

export interface ProductPublicationStorage {
  read(
    bucket: ProductPublicationStorageBucket,
    objectKey: string,
    signal: AbortSignal,
  ): Promise<ProductPublicationObject | null>;
  createPublicObject(input: {
    objectKey: string;
    bytes: Uint8Array;
    metadata: Record<string, string>;
    signal: AbortSignal;
  }): Promise<"created" | "already_exists">;
  deletePublicObject(objectKey: string, signal: AbortSignal): Promise<void>;
  publicUrl(objectKey: string): string;
}

export class ProductPublicationStorageError extends Error {
  constructor(
    public readonly temporary: boolean,
    message = "Product publication storage operation failed.",
  ) {
    super(message);
    this.name = "ProductPublicationStorageError";
  }
}

export type SupabaseProductPublicationStorageOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImplementation?: typeof fetch;
};

export class SupabaseProductPublicationStorage implements ProductPublicationStorage {
  private readonly fetchImplementation: typeof fetch;
  private readonly storageBaseUrl: string;

  constructor(private readonly options: SupabaseProductPublicationStorageOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.storageBaseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/storage/v1`;
  }

  async read(
    bucket: ProductPublicationStorageBucket,
    objectKey: string,
    signal: AbortSignal,
  ): Promise<ProductPublicationObject | null> {
    const response = await this.request(
      `${this.storageBaseUrl}/object/${encodePath(bucket)}/${encodePath(objectKey)}`,
      {
        method: "GET",
        headers: this.authorizationHeaders(),
        signal,
      },
    );
    if (await isNotFoundResponse(response)) return null;
    if (!response.ok) throw await storageError(response);
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: normalizeContentType(response.headers.get("content-type")),
      etag: response.headers.get("etag"),
    };
  }

  async createPublicObject(input: {
    objectKey: string;
    bytes: Uint8Array;
    metadata: Record<string, string>;
    signal: AbortSignal;
  }): Promise<"created" | "already_exists"> {
    const headers = this.authorizationHeaders();
    headers.set("cache-control", "max-age=31536000, immutable");
    headers.set("content-type", "image/jpeg");
    headers.set("x-upsert", "false");
    headers.set(
      "x-metadata",
      Buffer.from(JSON.stringify(input.metadata), "utf8").toString("base64"),
    );

    const response = await this.request(
      `${this.storageBaseUrl}/object/product-images/${encodePath(input.objectKey)}`,
      {
        method: "POST",
        headers,
        body: input.bytes as BodyInit,
        signal: input.signal,
      },
    );
    if (response.ok) return "created";
    if (await isDuplicateResponse(response)) return "already_exists";
    throw await storageError(response);
  }

  async deletePublicObject(objectKey: string, signal: AbortSignal): Promise<void> {
    const headers = this.authorizationHeaders();
    headers.set("content-type", "application/json");
    const response = await this.request(`${this.storageBaseUrl}/object/product-images`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ prefixes: [objectKey] }),
      signal,
    });
    if (!response.ok) throw await storageError(response);
  }

  publicUrl(objectKey: string): string {
    return `${this.storageBaseUrl}/object/public/product-images/${encodePath(objectKey)}`;
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
    } catch (error) {
      throw new ProductPublicationStorageError(
        true,
        error instanceof Error ? error.message : undefined,
      );
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

async function storageError(response: Response): Promise<ProductPublicationStorageError> {
  const temporary = response.status === 408 || response.status === 429 || response.status >= 500;
  return new ProductPublicationStorageError(temporary);
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
    return statusCode === 404;
  } catch {
    return false;
  }
}
