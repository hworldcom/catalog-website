import { describe, expect, it, vi } from "vitest";

import {
  buildDestinationMetadata,
  destinationObjectMatches,
  parseProductImageStorageBucket,
  PRODUCT_DRAFT_IMAGE_BUCKET,
  PRODUCT_IMAGE_BUCKET,
  SupabaseDestinationImageStorage,
} from "./destination-image-storage";

const metadata = buildDestinationMetadata({
  classifierOrganizationId: "00000000-0000-0000-0000-000000000001",
  classifierBatchId: "00000000-0000-0000-0000-000000000010",
  classifierGroupId: "00000000-0000-0000-0000-000000000020",
  classifierImageId: "00000000-0000-0000-0000-000000000030",
  sourceContentLength: 4,
});

function storage(fetchImplementation: typeof fetch) {
  return new SupabaseDestinationImageStorage({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "test-service-role-key",
    headTimeoutMs: 100,
    writeTimeoutMs: 100,
    fetchImplementation,
  });
}

describe("SupabaseDestinationImageStorage", () => {
  it("uses a create-only write with trusted metadata", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => Response.json({}, { status: 200 }));
    const result = await storage(fetchImplementation).createOnly({
      storageBucket: PRODUCT_DRAFT_IMAGE_BUCKET,
      destinationKey: "product-drafts/draft/images/image.jpg",
      bytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "image/jpeg",
      metadata,
    });

    expect(result).toBe("created");
    const request = fetchImplementation.mock.calls[0];
    expect(String(request?.[0])).toContain(
      "/storage/v1/object/product-draft-images/product-drafts/draft/images/image.jpg",
    );
    const headers = new Headers(request?.[1]?.headers);
    expect(headers.get("x-upsert")).toBe("false");
    expect(headers.get("content-type")).toBe("image/jpeg");
    expect(JSON.parse(Buffer.from(headers.get("x-metadata")!, "base64").toString("utf8"))).toEqual(
      metadata,
    );
  });

  it("recognizes an existing destination object", async () => {
    const result = await storage(async () =>
      Response.json({ error: "Duplicate" }, { status: 400 }),
    ).createOnly({
      storageBucket: PRODUCT_DRAFT_IMAGE_BUCKET,
      destinationKey: "existing.jpg",
      bytes: new Uint8Array([1]),
      contentType: "image/jpeg",
      metadata,
    });
    expect(result).toBe("already_exists");
  });

  it("returns null only for a missing object", async () => {
    await expect(
      storage(async () => new Response(null, { status: 404 })).getInfo(
        PRODUCT_DRAFT_IMAGE_BUCKET,
        "missing.jpg",
      ),
    ).resolves.toBeNull();

    await expect(
      storage(async () =>
        Response.json(
          {
            statusCode: "404",
            error: "not_found",
            message: "Object not found",
          },
          { status: 400 },
        ),
      ).getInfo(PRODUCT_DRAFT_IMAGE_BUCKET, "supabase-missing.jpg"),
    ).resolves.toBeNull();
  });

  it("does not treat an unrelated bad request as a missing object", async () => {
    await expect(
      storage(async () =>
        Response.json(
          {
            statusCode: "400",
            error: "invalid_request",
            message: "Invalid object request",
          },
          { status: 400 },
        ),
      ).getInfo(PRODUCT_DRAFT_IMAGE_BUCKET, "invalid.jpg"),
    ).rejects.toMatchObject({
      code: "destination_object_conflict",
      retryable: false,
    });
  });

  it("compares trusted metadata, content type, and size exactly", () => {
    expect(
      destinationObjectMatches(
        {
          contentType: "image/jpeg",
          sizeBytes: 4,
          metadata,
        },
        {
          contentType: "image/jpeg",
          sizeBytes: 4,
          metadata,
        },
      ),
    ).toBe(true);
    expect(
      destinationObjectMatches(
        {
          contentType: "image/jpeg",
          sizeBytes: 5,
          metadata,
        },
        {
          contentType: "image/jpeg",
          sizeBytes: 4,
          metadata,
        },
      ),
    ).toBe(false);
  });

  it("uses the explicitly selected public bucket for compatible callers", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          size: 4,
          content_type: "image/jpeg",
          metadata,
        },
        { status: 200 },
      ),
    );

    await storage(fetchImplementation).getInfo(PRODUCT_IMAGE_BUCKET, "published/product.jpg");

    expect(String(fetchImplementation.mock.calls[0]?.[0])).toContain(
      "/storage/v1/object/info/product-images/published/product.jpg",
    );
  });

  it("reads bytes from the explicitly selected bucket", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        }),
    );

    await expect(
      storage(fetchImplementation).read(PRODUCT_IMAGE_BUCKET, "legacy/image.jpg"),
    ).resolves.toEqual({
      bytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "image/jpeg",
    });
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toContain(
      "/storage/v1/object/product-images/legacy/image.jpg",
    );
  });

  it("deletes exactly one object from the explicitly selected bucket", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => Response.json([], { status: 200 }));

    await storage(fetchImplementation).delete(
      PRODUCT_IMAGE_BUCKET,
      "product-drafts/draft/images/image.jpg",
    );

    const [url, request] = fetchImplementation.mock.calls[0]!;
    expect(String(url)).toContain("/storage/v1/object/product-images");
    expect(request?.method).toBe("DELETE");
    expect(JSON.parse(String(request?.body))).toEqual({
      prefixes: ["product-drafts/draft/images/image.jpg"],
    });
  });

  it("rejects unsupported durable bucket values instead of falling back", () => {
    expect(() => parseProductImageStorageBucket("other-images")).toThrowError(
      "ProductDraft image has an unsupported storage bucket.",
    );
  });
});
