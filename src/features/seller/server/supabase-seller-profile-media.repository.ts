import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/lib/supabase/types";

import {
  sellerProfileAssetKindSchema,
  sellerProfileImageContentTypeSchema,
  type PrepareSellerProfileAssetUploadInput,
  type SellerProfileAssetKind,
} from "../seller-profile-media.types";
import type {
  SellerProfileAssetRecord,
  SellerProfileAssetRemovalClaim,
  SellerProfileMediaRepository,
} from "./seller-profile-media.repository";

type AdminClient = SupabaseClient<Database>;

const assetStatusSchema = z.enum(["pending", "available", "deleting", "failed", "deleted"]);
const assetRowSchema = z.object({
  id: z.string().uuid(),
  seller_id: z.string().uuid(),
  kind: sellerProfileAssetKindSchema,
  object_key: z.string().min(1),
  original_filename: z.string().min(1),
  mime_type: sellerProfileImageContentTypeSchema,
  size_bytes: z.number().int().positive(),
  status: assetStatusSchema,
  prepare_request_id: z.string().uuid(),
  error_code: z.string().nullable(),
});
const removalClaimSchema = z.object({
  result: z.enum(["deleted", "deleting"]),
  objectKey: z.string().min(1).optional(),
});

const assetColumns =
  "id,seller_id,kind,object_key,original_filename,mime_type,size_bytes,status,prepare_request_id,error_code";

export class SupabaseSellerProfileMediaRepository implements SellerProfileMediaRepository {
  constructor(private readonly database: AdminClient) {}

  async prepare(
    sellerId: string,
    input: PrepareSellerProfileAssetUploadInput,
  ): Promise<SellerProfileAssetRecord> {
    return this.one("prepare_seller_profile_asset_upload", {
      p_seller_id: sellerId,
      p_kind: input.kind,
      p_original_filename: input.originalFilename,
      p_mime_type: input.contentType,
      p_size_bytes: input.sizeBytes,
      p_prepare_request_id: input.requestId,
    });
  }

  async findOwned(sellerId: string, assetId: string): Promise<SellerProfileAssetRecord | null> {
    const response = await this.database
      .from("seller_profile_assets")
      .select(assetColumns)
      .eq("id", assetId)
      .eq("seller_id", sellerId)
      .maybeSingle();
    if (response.error) throw databaseError(response.error);
    return response.data ? parseAsset(response.data) : null;
  }

  async findById(assetId: string): Promise<SellerProfileAssetRecord | null> {
    const response = await this.database
      .from("seller_profile_assets")
      .select(assetColumns)
      .eq("id", assetId)
      .maybeSingle();
    if (response.error) throw databaseError(response.error);
    return response.data ? parseAsset(response.data) : null;
  }

  async findPublic(
    sellerId: string,
    kind: SellerProfileAssetKind,
    revision: number,
  ): Promise<SellerProfileAssetRecord | null> {
    const response = await this.database.rpc("read_public_seller_profile_asset", {
      p_seller_id: sellerId,
      p_kind: kind,
      p_revision: revision,
    });
    if (response.error) throw databaseError(response.error);
    const rows = z.array(assetRowSchema).safeParse(response.data);
    if (!rows.success || rows.data.length > 1) throw invalidResponse();
    return rows.data[0] ? mapAsset(rows.data[0]) : null;
  }

  completeUpload(
    sellerId: string,
    assetId: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<SellerProfileAssetRecord> {
    return this.one("complete_seller_profile_asset_upload", {
      p_seller_id: sellerId,
      p_asset_id: assetId,
      p_verified_mime_type: contentType,
      p_verified_size_bytes: sizeBytes,
    });
  }

  failValidation(sellerId: string, assetId: string): Promise<SellerProfileAssetRecord> {
    return this.one("fail_seller_profile_asset_validation", {
      p_seller_id: sellerId,
      p_asset_id: assetId,
    });
  }

  async beginRemoval(sellerId: string, assetId: string): Promise<SellerProfileAssetRemovalClaim> {
    return this.claim("begin_seller_profile_asset_removal", sellerId, assetId);
  }

  completeRemoval(sellerId: string, assetId: string): Promise<SellerProfileAssetRecord> {
    return this.one("complete_seller_profile_asset_removal", {
      p_seller_id: sellerId,
      p_asset_id: assetId,
    });
  }

  failRemoval(sellerId: string, assetId: string): Promise<SellerProfileAssetRecord> {
    return this.one("fail_seller_profile_asset_removal", {
      p_seller_id: sellerId,
      p_asset_id: assetId,
    });
  }

  claimCleanupRetry(sellerId: string, assetId: string): Promise<SellerProfileAssetRemovalClaim> {
    return this.claim("claim_seller_profile_asset_cleanup_retry", sellerId, assetId);
  }

  private async one(operation: string, parameters: Record<string, unknown>) {
    const response = await this.database.rpc(operation, parameters as never);
    if (response.error) throw databaseError(response.error);
    const rows = z.array(assetRowSchema).safeParse(response.data);
    if (!rows.success || rows.data.length !== 1) throw invalidResponse();
    return mapAsset(rows.data[0]);
  }

  private async claim(
    operation: string,
    sellerId: string,
    assetId: string,
  ): Promise<SellerProfileAssetRemovalClaim> {
    const response = await this.database.rpc(operation, {
      p_seller_id: sellerId,
      p_asset_id: assetId,
    } as never);
    if (response.error) throw databaseError(response.error);
    const parsed = removalClaimSchema.safeParse(response.data);
    if (!parsed.success) throw invalidResponse();
    if (parsed.data.result === "deleted") return { result: "deleted", objectKey: null };
    if (!parsed.data.objectKey) throw invalidResponse();
    return { result: "deleting", objectKey: parsed.data.objectKey };
  }
}

function parseAsset(value: unknown): SellerProfileAssetRecord {
  const parsed = assetRowSchema.safeParse(value);
  if (!parsed.success) throw invalidResponse();
  return mapAsset(parsed.data);
}

function mapAsset(row: z.infer<typeof assetRowSchema>): SellerProfileAssetRecord {
  return {
    assetId: row.id,
    sellerId: row.seller_id,
    kind: row.kind,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    contentType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    prepareRequestId: row.prepare_request_id,
    errorCode: row.error_code,
  };
}

function databaseError(error: { message: string; code?: string }): Error {
  const wrapped = new Error(error.message) as Error & { databaseCode?: string };
  wrapped.databaseCode = error.code;
  return wrapped;
}

function invalidResponse(): Error {
  return new Error("seller_profile_image_database_response_invalid");
}
