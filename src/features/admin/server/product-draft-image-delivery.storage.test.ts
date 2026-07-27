import { describe, expect, it, vi } from "vitest";

import { SupabaseProductDraftImageDeliveryStorage } from "./product-draft-image-delivery.storage";

function storage(fetchImplementation: typeof fetch, serviceRoleKey = "test-service-role-key") {
  return new SupabaseProductDraftImageDeliveryStorage({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey,
    fetchImplementation,
  });
}

describe("SupabaseProductDraftImageDeliveryStorage", () => {
  it("reads private object metadata with service-role authorization", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Response.json({
        size: 10,
        content_type: "image/jpeg",
        metadata: { source: "classifier" },
      }),
    );

    await expect(
      storage(fetchImplementation).getInfo(
        "product-drafts/draft/image one.jpg",
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      contentType: "image/jpeg",
      sizeBytes: 10,
      metadata: { source: "classifier" },
    });

    const [url, request] = fetchImplementation.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://project.supabase.co/storage/v1/object/info/product-draft-images/product-drafts/draft/image%20one.jpg",
    );
    const headers = new Headers(request?.headers);
    expect(headers.get("apikey")).toBe("test-service-role-key");
    expect(headers.get("authorization")).toBe("Bearer test-service-role-key");
  });

  it("creates a five-minute signed URL without putting credentials in it", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Response.json({
        signedURL:
          "/object/sign/product-draft-images/product-drafts/draft/image.jpg?token=opaque-token",
      }),
    );

    const url = await storage(fetchImplementation, "sb_secret_server-only").createSignedUrl(
      "product-drafts/draft/image.jpg",
      300,
      new AbortController().signal,
    );

    expect(url).toBe(
      "https://project.supabase.co/storage/v1/object/sign/product-draft-images/product-drafts/draft/image.jpg?token=opaque-token",
    );
    expect(url).not.toContain("sb_secret_server-only");
    const [requestUrl, request] = fetchImplementation.mock.calls[0]!;
    expect(String(requestUrl)).toContain(
      "/storage/v1/object/sign/product-draft-images/product-drafts/draft/image.jpg",
    );
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({ expiresIn: 300 });
    const headers = new Headers(request?.headers);
    expect(headers.get("apikey")).toBe("sb_secret_server-only");
    expect(headers.get("authorization")).toBeNull();
  });

  it("maps missing objects and object-specific signing rejection", async () => {
    await expect(
      storage(async () => new Response(null, { status: 404 })).getInfo(
        "missing.jpg",
        new AbortController().signal,
      ),
    ).resolves.toBeNull();

    await expect(
      storage(async () =>
        Response.json({ message: "Object cannot be signed" }, { status: 400 }),
      ).createSignedUrl("conflict.jpg", 300, new AbortController().signal),
    ).rejects.toMatchObject({
      failure: "signing_rejected",
    });
  });

  it("recognizes Supabase's HTTP 400 object-not-found response", async () => {
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
      ).getInfo("missing.jpg", new AbortController().signal),
    ).resolves.toBeNull();
  });

  it.each([401, 403, 408, 429, 500])(
    "maps HTTP %s to a request-level storage failure",
    async (status) => {
      await expect(
        storage(async () => new Response(null, { status })).getInfo(
          "image.jpg",
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({
        failure: "service_unavailable",
      });
    },
  );

  it("maps network and abort failures to request-level storage failure", async () => {
    await expect(
      storage(async () => {
        throw new TypeError("network failed");
      }).getInfo("image.jpg", new AbortController().signal),
    ).rejects.toMatchObject({
      failure: "service_unavailable",
    });
  });
});
