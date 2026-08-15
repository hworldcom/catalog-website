import { z } from "zod";

import {
  PrototypeAdministratorError,
  isPrototypeAdministrator,
  readPrototypeAdministratorUserIds,
} from "@/features/admin/server/prototype-administrator-access";
import {
  authenticateSupabaseRequest,
  SupabaseAuthenticationError,
  type AuthenticatedSupabaseRequest,
} from "@/lib/supabase/request-authentication";

import {
  SellerProfileImageError,
  sellerProfileAssetKindSchema,
} from "../seller-profile-media.types";
import { getCurrentSellerId } from "./current-seller.service";
import type { SellerProfileMediaService } from "./seller-profile-media.service";

const identifierSchema = z.string().uuid();
const revisionSchema = z.coerce.number().int().positive();
const noStoreHeaders = { "Cache-Control": "no-store" };

type Authenticator = (request: Request) => Promise<AuthenticatedSupabaseRequest>;

export async function handleGetPrivateSellerProfileAsset(
  request: Request,
  assetId: string,
  injectedService?: Pick<SellerProfileMediaService, "getPrivate">,
  authenticate: Authenticator = authenticateSupabaseRequest,
): Promise<Response> {
  try {
    const parsedAssetId = identifierSchema.parse(assetId);
    const context = await authenticate(request);
    const sellerId = await getCurrentSellerId(context);
    const service = injectedService ?? (await getService());

    let image;
    try {
      image = await service.getPrivate(parsedAssetId, {
        sellerId,
        prototypeAdministrator: false,
      });
    } catch (error) {
      if (!(error instanceof SellerProfileImageError) || error.statusCode !== 404) throw error;
      const administrator = isPrototypeAdministrator(
        context.userId,
        readPrototypeAdministratorUserIds(),
      );
      if (!administrator) throw error;
      image = await service.getPrivate(parsedAssetId, {
        sellerId,
        prototypeAdministrator: true,
      });
    }

    return imageResponse(image.bytes, image.contentType);
  } catch (error) {
    return mapError(error);
  }
}

export async function handleGetPublicSellerProfileAsset(
  request: Request,
  sellerId: string,
  kind: string,
  injectedService?: Pick<SellerProfileMediaService, "getPublic">,
): Promise<Response> {
  try {
    const parsedSellerId = identifierSchema.parse(sellerId);
    const parsedKind = sellerProfileAssetKindSchema.parse(kind);
    const revision = revisionSchema.parse(new URL(request.url).searchParams.get("revision"));
    const service = injectedService ?? (await getService());
    const image = await service.getPublic(parsedSellerId, parsedKind, revision);
    return imageResponse(image.bytes, image.contentType);
  } catch (error) {
    return mapError(error);
  }
}

async function getService(): Promise<SellerProfileMediaService> {
  const { getSellerProfileMediaService } = await import("./seller-profile-media.runtime");
  return getSellerProfileMediaService();
}

function imageResponse(bytes: Uint8Array, contentType: string): Response {
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: { ...noStoreHeaders, "Content-Type": contentType },
  });
}

function mapError(error: unknown): Response {
  if (
    error instanceof SupabaseAuthenticationError ||
    error instanceof PrototypeAdministratorError
  ) {
    return errorResponse(error.statusCode, error.code, error.message);
  }
  if (error instanceof SellerProfileImageError) {
    return errorResponse(error.statusCode, error.code, error.message);
  }
  if (error instanceof z.ZodError) {
    return errorResponse(400, "seller_profile_image_invalid", "The image request is invalid.");
  }
  console.error("[Seller profile image] Delivery request failed.", {
    exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
  });
  return errorResponse(
    503,
    "seller_profile_image_storage_unavailable",
    "Seller profile image storage is temporarily unavailable.",
  );
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ detail: { code, message } }, { status, headers: noStoreHeaders });
}
