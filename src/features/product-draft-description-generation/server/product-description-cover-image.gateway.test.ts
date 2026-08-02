import { describe, expect, it, vi } from "vitest";

import { ProductDescriptionCoverImageError } from "../product-description-cover-image.gateway";
import {
  readProductDescriptionCoverImageConfig,
  SupabaseProductDescriptionCoverImageGateway,
} from "./product-description-cover-image.gateway";

const supabaseUrl = "https://project.supabase.co";
const serviceRoleKey = "sb_secret_test";
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

describe("SupabaseProductDescriptionCoverImageGateway", () => {
  it("downloads and verifies a private imported cover", async () => {
    const fetchImplementation = vi.fn(async () => imageResponse(jpeg, "image/jpeg"));
    const gateway = gatewayWith(fetchImplementation);

    await expect(
      gateway.load(
        {
          source: "private_draft",
          imageId: uuid(1),
          storageBucket: "product-draft-images",
          objectKey: "drafts/a cover.jpg",
          contentType: "image/jpeg",
          sizeBytes: jpeg.byteLength,
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ mediaType: "image/jpeg", bytes: jpeg });

    expect(fetchImplementation).toHaveBeenCalledWith(
      `${supabaseUrl}/storage/v1/object/product-draft-images/drafts/a%20cover.jpg`,
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
    const request = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("apikey")).toBe(serviceRoleKey);
    expect(new Headers(request.headers).has("Authorization")).toBe(false);
  });

  it("downloads a direct cover only from the configured public product bucket", async () => {
    const fetchImplementation = vi.fn(async () => imageResponse(jpeg, "image/jpeg"));
    const gateway = gatewayWith(fetchImplementation);

    await gateway.load(
      {
        source: "public_product_upload",
        imageUrl: `${supabaseUrl}/storage/v1/object/public/product-images/user/products/a%20cover.jpg`,
      },
      new AbortController().signal,
    );

    expect(fetchImplementation).toHaveBeenCalledWith(
      `${supabaseUrl}/storage/v1/object/public/product-images/user/products/a%20cover.jpg`,
      expect.any(Object),
    );
    const request = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).has("apikey")).toBe(false);
    expect(new Headers(request.headers).has("Authorization")).toBe(false);
  });

  it("rejects an external direct cover without making a request", async () => {
    const fetchImplementation = vi.fn();
    const gateway = gatewayWith(fetchImplementation);

    await expect(
      gateway.load(
        { source: "public_product_upload", imageUrl: "https://example.com/product.jpg" },
        new AbortController().signal,
      ),
    ).rejects.toEqual(new ProductDescriptionCoverImageError("unsupported"));
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects a private object whose bytes conflict with durable metadata", async () => {
    const gateway = gatewayWith(vi.fn(async () => imageResponse(jpeg, "image/jpeg")));

    await expect(
      gateway.load(
        {
          source: "private_draft",
          imageId: uuid(1),
          storageBucket: "product-draft-images",
          objectKey: "drafts/cover.jpg",
          contentType: "image/jpeg",
          sizeBytes: jpeg.byteLength + 1,
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("rejects an oversized response before reading its body", async () => {
    const gateway = gatewayWith(
      vi.fn(async () =>
        imageResponse(jpeg, "image/jpeg", { "content-length": String(20 * 1024 * 1024 + 1) }),
      ),
    );

    await expect(
      gateway.load(
        {
          source: "public_product_upload",
          imageUrl: `${supabaseUrl}/storage/v1/object/public/product-images/user/products/cover.jpg`,
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("rejects an object that is absent or does not contain supported image bytes", async () => {
    const missingGateway = gatewayWith(vi.fn(async () => new Response(null, { status: 404 })));
    const invalidGateway = gatewayWith(
      vi.fn(async () => imageResponse(new Uint8Array([1, 2, 3, 4]), "image/jpeg")),
    );
    const cover = {
      source: "public_product_upload" as const,
      imageUrl: `${supabaseUrl}/storage/v1/object/public/product-images/user/products/cover.jpg`,
    };

    await expect(missingGateway.load(cover, new AbortController().signal)).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(invalidGateway.load(cover, new AbortController().signal)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });

  it("stops an unbounded response stream after the byte limit", async () => {
    const tenMiB = new Uint8Array(10 * 1024 * 1024);
    tenMiB.set(jpeg);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(tenMiB);
        controller.enqueue(tenMiB);
        controller.enqueue(new Uint8Array([0]));
        controller.close();
      },
    });
    const gateway = gatewayWith(
      vi.fn(
        async () =>
          new Response(stream, { status: 200, headers: { "content-type": "image/jpeg" } }),
      ),
    );

    await expect(
      gateway.load(
        {
          source: "public_product_upload",
          imageUrl: `${supabaseUrl}/storage/v1/object/public/product-images/user/products/cover.jpg`,
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("aborts image retrieval after the cover timeout", async () => {
    vi.useFakeTimers();
    try {
      const gateway = gatewayWith(
        vi.fn(
          async (_url: string | URL | Request, init?: RequestInit) =>
            await new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
              });
            }),
        ) as typeof fetch,
      );
      const result = expect(
        gateway.load(
          {
            source: "public_product_upload",
            imageUrl: `${supabaseUrl}/storage/v1/object/public/product-images/user/products/cover.jpg`,
          },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ kind: "unavailable" });

      await vi.advanceTimersByTimeAsync(10_000);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies the cover timeout until the complete response body is read", async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(jpeg);
        },
      });
      const gateway = gatewayWith(
        vi.fn(
          async () =>
            new Response(stream, { status: 200, headers: { "content-type": "image/jpeg" } }),
        ),
      );
      const result = expect(
        gateway.load(
          {
            source: "public_product_upload",
            imageUrl: `${supabaseUrl}/storage/v1/object/public/product-images/user/products/cover.jpg`,
          },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ kind: "unavailable" });

      await vi.advanceTimersByTimeAsync(10_000);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("readProductDescriptionCoverImageConfig", () => {
  it("requires the configured Supabase origin and service-role key", () => {
    expect(() => readProductDescriptionCoverImageConfig({})).toThrowError(
      expect.objectContaining({ code: "product_description_generation_configuration_invalid" }),
    );
    expect(
      readProductDescriptionCoverImageConfig({
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      }),
    ).toEqual({ supabaseUrl, serviceRoleKey });
  });
});

function gatewayWith(fetchImplementation: typeof fetch) {
  return new SupabaseProductDescriptionCoverImageGateway({
    supabaseUrl,
    serviceRoleKey,
    fetchImplementation,
  });
}

function imageResponse(
  bytes: Uint8Array,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(bytes.byteLength),
      ...extraHeaders,
    },
  });
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
