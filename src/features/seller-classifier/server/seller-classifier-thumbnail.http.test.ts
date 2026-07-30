import { describe, expect, it, vi } from "vitest";

import { SupabaseAuthenticationError } from "@/lib/supabase/request-authentication";

import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import { handleGetSellerClassifierThumbnail } from "./seller-classifier-thumbnail.http";

describe("handleGetSellerClassifierThumbnail", () => {
  it("authenticates before invoking the owned thumbnail service", async () => {
    const getThumbnail = vi.fn();
    const response = await handleGetSellerClassifierThumbnail(
      request(),
      workflowId,
      imageId,
      { getThumbnail },
      async () => {
        throw new SupabaseAuthenticationError(
          401,
          "authentication_required",
          "Authentication is required.",
        );
      },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getThumbnail).not.toHaveBeenCalled();
  });

  it("returns owned JPEG bytes with no-store", async () => {
    const getThumbnail = vi.fn(async () => new Uint8Array([255, 216, 255, 217]));
    const response = await handleGetSellerClassifierThumbnail(
      request(),
      workflowId,
      imageId,
      { getThumbnail },
      authenticated,
    );

    expect(getThumbnail).toHaveBeenCalledWith(workflowId, imageId, sellerId);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([255, 216, 255, 217]),
    );
  });

  it.each([
    {
      error: new SellerClassifierBatchError(
        404,
        "seller_classifier_batch_not_found",
        "The classifier workflow was not found.",
      ),
      code: "seller_classifier_batch_not_found",
    },
    {
      error: new SellerClassifierBatchError(
        404,
        "seller_classifier_thumbnail_not_found",
        "The classifier thumbnail is not available.",
      ),
      code: "seller_classifier_thumbnail_not_found",
    },
  ])("returns a no-store $code response", async ({ error, code }) => {
    const response = await handleGetSellerClassifierThumbnail(
      request(),
      workflowId,
      imageId,
      {
        getThumbnail: async () => {
          throw error;
        },
      },
      authenticated,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ detail: { code } });
  });
});

function request(): Request {
  return new Request(
    `http://example.test/v1/seller/classifier-batches/${workflowId}/images/${imageId}/thumbnail`,
    { headers: { Authorization: "Bearer header.payload.signature" } },
  );
}

async function authenticated() {
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: sellerId }, error: null }),
          }),
        }),
      }),
    },
    userId: uuid(4),
    claims: { sub: uuid(4) },
  } as never;
}

const workflowId = uuid(1);
const imageId = uuid(2);
const sellerId = uuid(3);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
