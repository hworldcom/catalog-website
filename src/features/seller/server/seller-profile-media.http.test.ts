import { afterEach, describe, expect, it, vi } from "vitest";

import { SellerProfileImageError } from "../seller-profile-media.types";
import {
  handleGetPrivateSellerProfileAsset,
  handleGetPublicSellerProfileAsset,
} from "./seller-profile-media.http";

const userId = "00000000-0000-4000-8000-000000000101";
const sellerId = "00000000-0000-4000-8000-000000000201";
const assetId = "00000000-0000-4000-8000-000000000301";
const originalAllowlist = process.env.BAZORIA_PROTOTYPE_ADMIN_USER_IDS;

afterEach(() => {
  if (originalAllowlist === undefined) delete process.env.BAZORIA_PROTOTYPE_ADMIN_USER_IDS;
  else process.env.BAZORIA_PROTOTYPE_ADMIN_USER_IDS = originalAllowlist;
});

describe("seller profile media delivery", () => {
  it("streams an owned private asset with no-store headers", async () => {
    const getPrivate = vi.fn(async () => image());
    const response = await handleGetPrivateSellerProfileAsset(
      authenticatedRequest(),
      assetId,
      { getPrivate },
      vi.fn(async () => context(sellerId)),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(getPrivate).toHaveBeenCalledWith(assetId, {
      sellerId,
      prototypeAdministrator: false,
    });
  });

  it("allows an allowlisted administrator after the owner-safe not-found attempt", async () => {
    process.env.BAZORIA_PROTOTYPE_ADMIN_USER_IDS = userId;
    const getPrivate = vi.fn().mockRejectedValueOnce(notFound()).mockResolvedValueOnce(image());
    const response = await handleGetPrivateSellerProfileAsset(
      authenticatedRequest(),
      assetId,
      { getPrivate },
      vi.fn(async () => context(null)),
    );

    expect(response.status).toBe(200);
    expect(getPrivate).toHaveBeenLastCalledWith(assetId, {
      sellerId: null,
      prototypeAdministrator: true,
    });
  });

  it("returns the same not-found response to a non-owner", async () => {
    process.env.BAZORIA_PROTOTYPE_ADMIN_USER_IDS = "";
    const response = await handleGetPrivateSellerProfileAsset(
      authenticatedRequest(),
      assetId,
      { getPrivate: vi.fn(async () => Promise.reject(notFound())) },
      vi.fn(async () => context(null)),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: "seller_profile_image_not_found" },
    });
  });

  it("requires the exact public revision and keeps public responses uncached", async () => {
    const getPublic = vi.fn(async () => image());
    const response = await handleGetPublicSellerProfileAsset(
      new Request("http://localhost/v1/public/image?revision=7"),
      sellerId,
      "cover",
      { getPublic },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getPublic).toHaveBeenCalledWith(sellerId, "cover", 7);
  });

  it("rejects a malformed public revision without reading storage", async () => {
    const getPublic = vi.fn(async () => image());
    const response = await handleGetPublicSellerProfileAsset(
      new Request("http://localhost/v1/public/image"),
      sellerId,
      "logo",
      { getPublic },
    );

    expect(response.status).toBe(400);
    expect(getPublic).not.toHaveBeenCalled();
  });
});

function context(ownedSellerId: string | null) {
  const maybeSingle = vi.fn(async () => ({
    data: ownedSellerId ? { id: ownedSellerId } : null,
    error: null,
  }));
  return {
    userId,
    claims: {},
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    },
  } as never;
}

function authenticatedRequest() {
  return new Request(`http://localhost/v1/seller-profile-assets/${assetId}`, {
    headers: { Authorization: "Bearer header.payload.signature" },
  });
}

function image() {
  return { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" };
}

function notFound() {
  return new SellerProfileImageError(
    404,
    "seller_profile_image_not_found",
    "The seller profile image was not found.",
  );
}
