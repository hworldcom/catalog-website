import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  productDraftImageContentTypeSchema,
  ProductDraftImageLifecycleError,
  type ProductDraftImageContentType,
} from "../product-draft-image-lifecycle.types";
import type {
  FinalizeProductDraftImageRecord,
  PrepareProductDraftImageRecordsResult,
  ProductDraftImageLifecycleRecord,
  ProductDraftImageLifecycleRepository,
} from "./product-draft-image-lifecycle.repository";
import type { Database, Json } from "@/lib/supabase/types";
import { readProductModerationEditState } from "./product-moderation-edit-state";

type AdminClient = SupabaseClient<Database>;

const durableStatusSchema = z.enum(["pending", "available", "failed", "deleting"]);

const preparedPayloadSchema = z.object({
  result: z.enum([
    "prepared",
    "not_found",
    "not_editable",
    "not_allowed",
    "gallery_locked",
    "stale",
    "limit_exceeded",
    "upload_conflict",
    "cleanup_required",
    "verification_required",
  ]),
  galleryRevision: z.number().int().nonnegative().optional(),
  moderationRevision: z.number().int().positive().optional(),
  images: z
    .array(
      z.object({
        imageId: z.string().uuid(),
        clientUploadId: z.string().uuid(),
        originalFilename: z.string().min(1),
        contentType: productDraftImageContentTypeSchema,
        sizeBytes: z.number().int().positive(),
        destinationKey: z.string().min(1),
        durableStatus: durableStatusSchema,
      }),
    )
    .optional(),
});

const mutationPayloadSchema = z.object({
  result: z.string().min(1),
  galleryRevision: z.number().int().nonnegative().optional(),
  moderationRevision: z.number().int().positive(),
  destinationKey: z.string().min(1).optional(),
});

export class SupabaseProductDraftImageLifecycleRepository implements ProductDraftImageLifecycleRepository {
  constructor(private readonly database: AdminClient) {}

  async listByClientUploadIds(
    productDraftId: string,
    sellerId: string,
    clientUploadIds: string[],
  ): Promise<ProductDraftImageLifecycleRecord[]> {
    return this.list(productDraftId, sellerId, "client_upload_id", clientUploadIds);
  }

  async listByImageIds(
    productDraftId: string,
    sellerId: string,
    imageIds: string[],
  ): Promise<ProductDraftImageLifecycleRecord[]> {
    return this.list(productDraftId, sellerId, "id", imageIds);
  }

  async prepare(
    input: Parameters<ProductDraftImageLifecycleRepository["prepare"]>[0],
  ): Promise<PrepareProductDraftImageRecordsResult> {
    const response = await this.database.rpc("prepare_initial_product_draft_image_uploads", {
      p_product_draft_id: input.productDraftId,
      p_seller_id: input.sellerId,
      p_expected_moderation_revision: input.expectedModerationRevision,
      p_expected_gallery_revision: input.expectedGalleryRevision,
      p_files: input.files.map((file) => ({
        client_upload_id: file.clientUploadId,
        original_filename: file.originalFilename,
        content_type: file.contentType,
        size_bytes: file.sizeBytes,
      })) as Json,
      p_verified_absent_image_ids: input.verifiedAbsentImageIds,
    });
    if (response.error) throw databaseError(response.error);
    const parsed = preparedPayloadSchema.safeParse(response.data);
    if (!parsed.success) throw invalidResponse();
    return {
      result: parsed.data.result,
      galleryRevision: parsed.data.galleryRevision ?? null,
      moderationRevision: parsed.data.moderationRevision ?? null,
      images: (parsed.data.images ?? []).map((image) => ({
        imageId: image.imageId,
        productDraftId: input.productDraftId,
        clientUploadId: image.clientUploadId,
        originalFilename: image.originalFilename,
        contentType: image.contentType,
        sizeBytes: image.sizeBytes,
        destinationKey: image.destinationKey,
        durableStatus: image.durableStatus,
        lifecycleErrorCode: null,
      })),
    };
  }

  async finalize(input: {
    productDraftId: string;
    sellerId: string;
    expectedModerationRevision: number;
    results: FinalizeProductDraftImageRecord[];
  }) {
    return this.mutate("finalize_initial_product_draft_image_uploads", {
      p_product_draft_id: input.productDraftId,
      p_seller_id: input.sellerId,
      p_expected_moderation_revision: input.expectedModerationRevision,
      p_results: input.results.map((result) => ({
        image_id: result.imageId,
        outcome: result.outcome,
        ...(result.contentType ? { content_type: result.contentType } : {}),
        ...(result.sizeBytes !== undefined ? { size_bytes: result.sizeBytes } : {}),
        ...(result.errorCode ? { error_code: result.errorCode } : {}),
      })) as Json,
    });
  }

  async failUploadCleanup(
    input: Parameters<ProductDraftImageLifecycleRepository["failUploadCleanup"]>[0],
  ) {
    return this.mutate("fail_initial_product_draft_image_upload_cleanup", {
      p_product_draft_id: input.productDraftId,
      p_seller_id: input.sellerId,
      p_expected_moderation_revision: input.expectedModerationRevision,
      p_product_draft_image_id: input.imageId,
    });
  }

  async completeUploadCleanup(
    input: Parameters<ProductDraftImageLifecycleRepository["completeUploadCleanup"]>[0],
  ) {
    return this.mutate("complete_initial_product_draft_image_upload_cleanup", {
      p_product_draft_id: input.productDraftId,
      p_seller_id: input.sellerId,
      p_expected_moderation_revision: input.expectedModerationRevision,
      p_product_draft_image_id: input.imageId,
    });
  }

  async update(input: Parameters<ProductDraftImageLifecycleRepository["update"]>[0]) {
    return this.mutate("update_initial_product_draft_image_gallery", {
      p_product_draft_id: input.productDraftId,
      p_seller_id: input.sellerId,
      p_expected_moderation_revision: input.expectedModerationRevision,
      p_expected_gallery_revision: input.expectedGalleryRevision,
      p_ordered_available_image_ids: input.orderedAvailableImageIds,
      p_cover_image_id: input.coverImageId,
    });
  }

  async beginRemoval(input: Parameters<ProductDraftImageLifecycleRepository["beginRemoval"]>[0]) {
    return this.mutate("begin_initial_product_draft_image_removal", {
      p_product_draft_id: input.productDraftId,
      p_seller_id: input.sellerId,
      p_expected_moderation_revision: input.expectedModerationRevision,
      p_product_draft_image_id: input.imageId,
      p_expected_gallery_revision: input.expectedGalleryRevision,
    });
  }

  async completeRemoval(
    input: Parameters<ProductDraftImageLifecycleRepository["completeRemoval"]>[0],
  ) {
    return this.mutate("complete_initial_product_draft_image_removal", {
      p_product_draft_id: input.productDraftId,
      p_seller_id: input.sellerId,
      p_expected_moderation_revision: input.expectedModerationRevision,
      p_product_draft_image_id: input.imageId,
    });
  }

  async failRemoval(input: Parameters<ProductDraftImageLifecycleRepository["failRemoval"]>[0]) {
    return this.mutate("fail_initial_product_draft_image_removal", {
      p_product_draft_id: input.productDraftId,
      p_seller_id: input.sellerId,
      p_expected_moderation_revision: input.expectedModerationRevision,
      p_product_draft_image_id: input.imageId,
    });
  }

  private async list(
    productDraftId: string,
    sellerId: string,
    identifierColumn: "id" | "client_upload_id",
    identifiers: string[],
  ): Promise<ProductDraftImageLifecycleRecord[]> {
    if (identifiers.length === 0) return [];
    const editState = await readProductModerationEditState(this.database, productDraftId, sellerId);
    if (!editState || !editState.editable) return [];

    let query = this.database
      .from("product_draft_images")
      .select(
        "id,product_draft_id,client_upload_id,original_filename,content_type,size_bytes,destination_key,status,lifecycle_error_code",
      )
      .eq("product_draft_id", productDraftId)
      .eq("source_kind", "seller_upload")
      .in(identifierColumn, identifiers);
    if (editState.workingCopy) {
      const memberships = await this.database
        .from("product_moderation_working_copy_images")
        .select("product_draft_image_id")
        .eq("product_id", productDraftId);
      if (memberships.error) throw databaseError(memberships.error);
      const workingImageIds = (memberships.data ?? []).map(
        (membership) => membership.product_draft_image_id,
      );
      if (workingImageIds.length === 0) return [];
      query = query.in("id", workingImageIds);
    }
    const response = await query;
    if (response.error) throw databaseError(response.error);

    return (response.data ?? []).map((row) => {
      const contentType = parseContentType(row.content_type);
      if (
        !row.client_upload_id ||
        !row.original_filename ||
        row.size_bytes === null ||
        !durableStatusSchema.safeParse(row.status).success
      ) {
        throw invalidResponse();
      }
      return {
        imageId: row.id,
        productDraftId: row.product_draft_id,
        clientUploadId: row.client_upload_id,
        originalFilename: row.original_filename,
        contentType,
        sizeBytes: row.size_bytes,
        destinationKey: row.destination_key,
        durableStatus: durableStatusSchema.parse(row.status),
        lifecycleErrorCode: row.lifecycle_error_code,
      };
    });
  }

  private async mutate(
    functionName:
      | "finalize_initial_product_draft_image_uploads"
      | "complete_initial_product_draft_image_upload_cleanup"
      | "fail_initial_product_draft_image_upload_cleanup"
      | "update_initial_product_draft_image_gallery"
      | "begin_initial_product_draft_image_removal"
      | "complete_initial_product_draft_image_removal"
      | "fail_initial_product_draft_image_removal",
    args: Record<string, Json | undefined>,
  ) {
    const response = await this.database.rpc(functionName, args as never);
    if (response.error) throw databaseError(response.error);
    const parsed = mutationPayloadSchema.safeParse(response.data);
    if (!parsed.success) throw invalidResponse();
    return {
      productDraftId: String(args.p_product_draft_id),
      result: parsed.data.result,
      galleryRevision: parsed.data.galleryRevision ?? 0,
      moderationRevision: parsed.data.moderationRevision,
      destinationKey: parsed.data.destinationKey ?? null,
    };
  }
}

function parseContentType(value: string | null): ProductDraftImageContentType {
  const parsed = productDraftImageContentTypeSchema.safeParse(value);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

function databaseError(error: { message: string }): Error {
  if (error.message.includes("product_moderation_working_revision_conflict")) {
    return new ProductDraftImageLifecycleError(
      409,
      "product_moderation_working_revision_conflict",
      "The ProductDraft changed. Refresh it before changing pictures again.",
    );
  }
  if (error.message.includes("product_moderation_submission_conflict")) {
    return new ProductDraftImageLifecycleError(
      409,
      "product_moderation_submission_conflict",
      "The ProductDraft pictures are locked by an active moderation submission.",
    );
  }
  return new Error(`ProductDraft image lifecycle database operation failed: ${error.message}`);
}

function invalidResponse(): Error {
  return new Error("ProductDraft image lifecycle database response was invalid.");
}
