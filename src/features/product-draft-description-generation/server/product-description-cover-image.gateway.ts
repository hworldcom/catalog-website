import {
  PRODUCT_DESCRIPTION_COVER_MAX_BYTES,
  PRODUCT_DESCRIPTION_COVER_TIMEOUT_MS,
  ProductDescriptionCoverImageError,
  type ProductDescriptionCoverImage,
  type ProductDescriptionCoverImageGateway,
} from "../product-description-cover-image.gateway";
import type { ProductDescriptionGenerationCoverReference } from "../product-draft-description-generation.repository";
import { generationError } from "../product-draft-description-generation.types";

type CoverImageGatewayConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

type SupabaseProductDescriptionCoverImageGatewayOptions = CoverImageGatewayConfig & {
  fetchImplementation?: typeof fetch;
};

const PUBLIC_PRODUCT_IMAGE_PATH = "/storage/v1/object/public/product-images/";

export function readProductDescriptionCoverImageConfig(
  environment: NodeJS.ProcessEnv = process.env,
): CoverImageGatewayConfig {
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(environment.SUPABASE_URL ?? "");
  } catch {
    throw configurationInvalid();
  }
  if (
    (supabaseUrl.protocol !== "https:" && supabaseUrl.protocol !== "http:") ||
    supabaseUrl.username ||
    supabaseUrl.password ||
    supabaseUrl.search ||
    supabaseUrl.hash ||
    !serviceRoleKey ||
    serviceRoleKey.trim() !== serviceRoleKey
  ) {
    throw configurationInvalid();
  }
  return {
    supabaseUrl: supabaseUrl.toString().replace(/\/+$/, ""),
    serviceRoleKey,
  };
}

export class SupabaseProductDescriptionCoverImageGateway implements ProductDescriptionCoverImageGateway {
  private readonly fetchImplementation: typeof fetch;
  private readonly supabaseOrigin: string;
  private readonly storageBaseUrl: string;

  constructor(private readonly options: SupabaseProductDescriptionCoverImageGatewayOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    const configuredUrl = new URL(options.supabaseUrl);
    this.supabaseOrigin = configuredUrl.origin;
    this.storageBaseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/storage/v1`;
  }

  async load(
    cover: ProductDescriptionGenerationCoverReference,
    signal: AbortSignal,
  ): Promise<ProductDescriptionCoverImage> {
    const request =
      cover.source === "private_draft"
        ? {
            url: `${this.storageBaseUrl}/object/product-draft-images/${encodePath(cover.objectKey)}`,
            expectedContentType: cover.contentType,
            expectedSizeBytes: cover.sizeBytes,
            authenticated: true,
          }
        : {
            url: this.resolvePublicProductImageUrl(cover.imageUrl),
            expectedContentType: null,
            expectedSizeBytes: null,
            authenticated: false,
          };

    return this.loadRequest(
      request,
      request.authenticated ? this.authorizationHeaders() : new Headers(),
      signal,
    );
  }

  private resolvePublicProductImageUrl(value: string): string {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw unsupported();
    }
    if (
      url.origin !== this.supabaseOrigin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(PUBLIC_PRODUCT_IMAGE_PATH)
    ) {
      throw unsupported();
    }

    const rawObjectKey = url.pathname.slice(PUBLIC_PRODUCT_IMAGE_PATH.length);
    let segments: string[];
    try {
      segments = rawObjectKey.split("/").map((segment) => decodeURIComponent(segment));
    } catch {
      throw unsupported();
    }
    if (
      segments.length === 0 ||
      segments.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          segment.includes("/") ||
          segment.includes("\\"),
      )
    ) {
      throw unsupported();
    }
    return `${this.supabaseOrigin}${PUBLIC_PRODUCT_IMAGE_PATH}${encodePath(segments.join("/"))}`;
  }

  private async loadRequest(
    request: {
      url: string;
      expectedContentType: ProductDescriptionCoverImage["mediaType"] | null;
      expectedSizeBytes: number | null;
    },
    headers: Headers,
    externalSignal: AbortSignal,
  ): Promise<ProductDescriptionCoverImage> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(unavailable());
      }, PRODUCT_DESCRIPTION_COVER_TIMEOUT_MS);
    });
    const abort = () => controller.abort();
    externalSignal.addEventListener("abort", abort, { once: true });
    if (externalSignal.aborted) controller.abort();

    try {
      return await Promise.race([
        this.fetchAndValidate(request, headers, controller.signal),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof ProductDescriptionCoverImageError) throw error;
      throw unavailable();
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      externalSignal.removeEventListener("abort", abort);
    }
  }

  private async fetchAndValidate(
    request: {
      url: string;
      expectedContentType: ProductDescriptionCoverImage["mediaType"] | null;
      expectedSizeBytes: number | null;
    },
    headers: Headers,
    signal: AbortSignal,
  ): Promise<ProductDescriptionCoverImage> {
    const response = await this.fetchImplementation(request.url, {
      method: "GET",
      headers,
      redirect: "manual",
      signal,
    });
    if (!response.ok) throw unavailable();

    const declaredSize = parseContentLength(response.headers.get("content-length"));
    if (declaredSize !== null && declaredSize > PRODUCT_DESCRIPTION_COVER_MAX_BYTES) {
      throw unavailable();
    }

    const bytes = await readBoundedBody(response, PRODUCT_DESCRIPTION_COVER_MAX_BYTES, signal);
    const mediaType = detectMediaType(bytes);
    const responseMediaType = normalizeMediaType(response.headers.get("content-type"));
    if (!mediaType || (responseMediaType && responseMediaType !== mediaType)) {
      throw unavailable();
    }
    if (
      request.expectedContentType &&
      (request.expectedContentType !== mediaType || request.expectedSizeBytes !== bytes.byteLength)
    ) {
      throw unavailable();
    }

    return { mediaType, bytes };
  }

  private authorizationHeaders(): Headers {
    const headers = new Headers({ apikey: this.options.serviceRoleKey });
    if (!isOpaqueSupabaseKey(this.options.serviceRoleKey)) {
      headers.set("Authorization", `Bearer ${this.options.serviceRoleKey}`);
    }
    return headers;
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) throw unavailable();
  const reader = response.body.getReader();
  const abort = () => void reader.cancel();
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw unavailable();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ProductDescriptionCoverImageError) throw error;
    throw unavailable();
  } finally {
    signal.removeEventListener("abort", abort);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function detectMediaType(bytes: Uint8Array): ProductDescriptionCoverImage["mediaType"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function normalizeMediaType(
  value: string | null,
): ProductDescriptionCoverImage["mediaType"] | null {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType === "image/jpeg" || mediaType === "image/png" || mediaType === "image/webp") {
    return mediaType;
  }
  return null;
}

function parseContentLength(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function encodePath(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isOpaqueSupabaseKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function unsupported(): ProductDescriptionCoverImageError {
  return new ProductDescriptionCoverImageError("unsupported");
}

function unavailable(): ProductDescriptionCoverImageError {
  return new ProductDescriptionCoverImageError("unavailable");
}

function configurationInvalid() {
  return generationError(
    500,
    "product_description_generation_configuration_invalid",
    "Product description generation is not configured correctly.",
  );
}
