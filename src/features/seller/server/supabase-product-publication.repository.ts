import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  ProductPublicationAuthorizationInput,
  ProductPublicationAuthorizationResult,
  ProductPublicationRepository,
  ProductPublicationRetryResult,
} from "./product-publication.repository";
import type {
  ProductPublicationCorrelation,
  ProductPublicationItem,
  ProductPublicationItemStatus,
  ProductPublicationRun,
  ProductPublicationStatus,
} from "./product-publication.types";

type AdminClient = SupabaseClient<Database>;
type RunRow = Database["public"]["Tables"]["product_image_publication_runs"]["Row"];
type ItemRow = Database["public"]["Tables"]["product_image_publication_items"]["Row"];

export class SupabaseProductPublicationRepository implements ProductPublicationRepository {
  constructor(private readonly database: AdminClient) {}

  async authorize(
    input: ProductPublicationAuthorizationInput,
  ): Promise<ProductPublicationAuthorizationResult> {
    const response = await this.database.rpc("authorize_product_publication_with_correlation", {
      p_product_draft_id: input.productDraftId,
      p_seller_id: input.sellerId,
      p_audiences: input.audiences,
      p_title_patch_present: input.titlePatchPresent,
      p_title: input.title,
      p_description_patch_present: input.descriptionPatchPresent,
      p_description: input.description,
      p_category_id: input.categoryId,
      p_moq: input.moq,
      p_pack_size: input.packSize,
      p_price: input.price,
      p_currency: input.currency,
      p_stock: input.stock,
      p_cover_image_url_patch_present: input.coverImageUrlPatchPresent,
      p_cover_image_url: input.coverImageUrl,
      p_trending: input.trending,
      p_delegated_action_request_id: input.delegatedAction?.requestId ?? null,
      p_delegated_action_request_fingerprint: input.delegatedAction?.requestFingerprint ?? null,
    });
    if (response.error) {
      if (isCategoryRequired(response.error)) {
        return { result: "category_required", productDraftId: input.productDraftId };
      }
      throwDatabaseError(response.error);
    }
    const result = response.data?.[0];
    if (!result) throw new Error("Product publication authorization returned no result.");

    if (result.result === "pending" || result.result === "in_progress") {
      if (
        !result.product_draft_id ||
        (result.publication_status !== "pending" && result.publication_status !== "running")
      ) {
        throw new Error("Product publication authorization returned an incomplete result.");
      }
      return {
        result: result.result,
        productDraftId: result.product_draft_id,
        status: result.publication_status,
      };
    }

    if (result.result === "product_publication_category_required") {
      return {
        result: "category_required",
        productDraftId: result.product_draft_id,
      };
    }

    if (result.result === "product_publication_audience_required") {
      return {
        result: "audience_required",
        productDraftId: result.product_draft_id,
      };
    }

    if (
      result.result === "not_found" ||
      result.result === "not_allowed" ||
      result.result === "direct_product" ||
      result.result === "cover_not_allowed" ||
      result.result === "image_required" ||
      result.result === "images_not_ready" ||
      result.result === "not_editable" ||
      result.result === "facts_missing" ||
      result.result === "title_required" ||
      result.result === "title_invalid" ||
      result.result === "description_invalid" ||
      result.result === "category_required" ||
      result.result === "product_code_company_unconfigured" ||
      result.result === "product_code_category_unconfigured" ||
      result.result === "product_code_allocation_failed" ||
      result.result === "seller_approval_required"
    ) {
      return {
        result: result.result,
        productDraftId: result.product_draft_id,
      };
    }
    throw new Error(`Unexpected product publication authorization result: ${result.result}`);
  }

  async getRun(productDraftId: string): Promise<ProductPublicationRun | null> {
    const response = await this.database
      .from("product_image_publication_runs")
      .select("*")
      .eq("product_draft_id", productDraftId)
      .maybeSingle();
    if (response.error) throwDatabaseError(response.error);
    return response.data ? mapRun(response.data) : null;
  }

  async getFirstItemErrorCode(productDraftId: string): Promise<string | null> {
    const response = await this.database
      .from("product_image_publication_items")
      .select("error_code")
      .eq("product_draft_id", productDraftId)
      .not("error_code", "is", null)
      .order("publication_order")
      .order("product_draft_image_id")
      .limit(1)
      .maybeSingle();
    if (response.error) throwDatabaseError(response.error);
    return response.data?.error_code ?? null;
  }

  async claimRun(
    productDraftId: string,
    claimTimeoutSeconds: number,
  ): Promise<ProductPublicationRun | null> {
    const response = await this.database.rpc("claim_product_image_publication", {
      p_product_draft_id: productDraftId,
      p_claim_timeout_seconds: claimTimeoutSeconds,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data?.[0] ? mapRun(response.data[0]) : null;
  }

  async listItems(productDraftId: string): Promise<ProductPublicationItem[]> {
    const response = await this.database
      .from("product_image_publication_items")
      .select("*")
      .eq("product_draft_id", productDraftId)
      .order("publication_order")
      .order("product_draft_image_id");
    if (response.error) throwDatabaseError(response.error);
    return (response.data ?? []).map(mapItem);
  }

  async recordObjectCreated(input: {
    productDraftId: string;
    productDraftImageId: string;
    attemptToken: string;
    sourceSha256: string;
    publicUrl: string;
  }): Promise<boolean> {
    const response = await this.database.rpc("record_product_image_publication_object_created", {
      p_product_draft_id: input.productDraftId,
      p_product_draft_image_id: input.productDraftImageId,
      p_attempt_token: input.attemptToken,
      p_source_sha256: input.sourceSha256,
      p_public_url: input.publicUrl,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async clearObjectOwnership(input: {
    productDraftId: string;
    productDraftImageId: string;
    attemptToken: string;
    createdAttemptToken: string;
  }): Promise<boolean> {
    const response = await this.database.rpc("clear_product_image_publication_object_ownership", {
      p_product_draft_id: input.productDraftId,
      p_product_draft_image_id: input.productDraftImageId,
      p_attempt_token: input.attemptToken,
      p_created_attempt_token: input.createdAttemptToken,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async verifyItem(input: {
    productDraftId: string;
    productDraftImageId: string;
    attemptToken: string;
    sourceSha256: string;
    publicSizeBytes: number;
    publicSha256: string;
    publicEtag: string | null;
    publicUrl: string;
    createdByCurrentAttempt: boolean;
  }): Promise<boolean> {
    const response = await this.database.rpc("verify_product_image_publication_item", {
      p_product_draft_id: input.productDraftId,
      p_product_draft_image_id: input.productDraftImageId,
      p_attempt_token: input.attemptToken,
      p_source_sha256: input.sourceSha256,
      p_public_size_bytes: input.publicSizeBytes,
      p_public_sha256: input.publicSha256,
      p_public_etag: input.publicEtag,
      p_public_url: input.publicUrl,
      p_created_by_current_attempt: input.createdByCurrentAttempt,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async failAttempt(input: {
    productDraftId: string;
    productDraftImageId: string;
    attemptToken: string;
    errorCode: string;
  }): Promise<boolean> {
    const response = await this.database.rpc("fail_product_image_publication_attempt", {
      p_product_draft_id: input.productDraftId,
      p_product_draft_image_id: input.productDraftImageId,
      p_attempt_token: input.attemptToken,
      p_error_code: input.errorCode,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async failClaimedRun(input: {
    productDraftId: string;
    attemptToken: string;
    errorCode: string;
  }): Promise<boolean> {
    const response = await this.database.rpc("fail_claimed_product_image_publication", {
      p_product_draft_id: input.productDraftId,
      p_attempt_token: input.attemptToken,
      p_error_code: input.errorCode,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async hasPublishedImage(productDraftImageId: string): Promise<boolean> {
    const response = await this.database
      .from("product_images")
      .select("id")
      .eq("source_product_draft_image_id", productDraftImageId)
      .limit(1)
      .maybeSingle();
    if (response.error) throwDatabaseError(response.error);
    return response.data !== null;
  }

  async completeCleanup(input: {
    productDraftId: string;
    productDraftImageId: string;
    createdAttemptToken: string;
  }): Promise<boolean> {
    const response = await this.database.rpc("complete_product_image_publication_cleanup", {
      p_product_draft_id: input.productDraftId,
      p_product_draft_image_id: input.productDraftImageId,
      p_created_attempt_token: input.createdAttemptToken,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async finalizeCleanup(productDraftId: string): Promise<boolean> {
    const response = await this.database.rpc("finalize_product_image_publication_cleanup", {
      p_product_draft_id: productDraftId,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async finalize(input: {
    productDraftId: string;
    sellerId: string;
    attemptToken: string;
  }): Promise<"completed" | "stale_attempt" | "not_found" | "not_allowed"> {
    const response = await this.database.rpc("finalize_seller_product_publication", {
      p_product_draft_id: input.productDraftId,
      p_seller_id: input.sellerId,
      p_attempt_token: input.attemptToken,
    });
    if (response.error) throwDatabaseError(response.error);
    return parseResult<"completed" | "stale_attempt" | "not_found" | "not_allowed">(response.data, [
      "completed",
      "stale_attempt",
      "not_found",
      "not_allowed",
    ]);
  }

  async markDispatchFailed(productDraftId: string): Promise<boolean> {
    const response = await this.database.rpc("mark_product_image_publication_dispatch_failed", {
      p_product_draft_id: productDraftId,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async retry(
    productDraftId: string,
    sellerId: string,
    delegatedAction: ProductPublicationCorrelation | null,
  ): Promise<ProductPublicationRetryResult> {
    const response = await this.database.rpc("retry_product_publication_with_correlation", {
      p_product_draft_id: productDraftId,
      p_seller_id: sellerId,
      p_delegated_action_request_id: delegatedAction?.requestId ?? null,
      p_delegated_action_request_fingerprint: delegatedAction?.requestFingerprint ?? null,
    });
    if (response.error) {
      if (isCategoryRequired(response.error)) return "category_required";
      throwDatabaseError(response.error);
    }
    return parseResult<ProductPublicationRetryResult>(response.data, [
      "requeued",
      "noop",
      "not_found",
      "not_allowed",
      "cleanup_required",
      "title_required",
      "title_invalid",
      "description_invalid",
      "audience_required",
      "category_required",
      "seller_approval_required",
      "in_progress",
    ]);
  }
}

function mapRun(row: RunRow): ProductPublicationRun {
  return {
    productDraftId: row.product_draft_id,
    sellerId: row.seller_id,
    status: parseRunStatus(row.status),
    attemptCount: row.attempt_count,
    attemptToken: row.attempt_token,
    claimStartedAt: row.claim_started_at,
    errorCode: row.error_code,
    completedAt: row.completed_at,
    delegatedActionRequestId: row.delegated_action_request_id,
    delegatedActionRequestFingerprint: row.delegated_action_request_fingerprint,
  };
}

function mapItem(row: ItemRow): ProductPublicationItem {
  if (
    row.source_bucket !== "product-draft-images" ||
    !["image/jpeg", "image/png", "image/webp"].includes(row.expected_content_type)
  ) {
    throw new Error("Product publication item has unsupported source metadata.");
  }
  return {
    productDraftId: row.product_draft_id,
    productDraftImageId: row.product_draft_image_id,
    sourceBucket: row.source_bucket,
    sourceObjectKey: row.source_object_key,
    destinationKey: row.destination_key,
    sourcePosition: row.source_position,
    publicationOrder: row.publication_order,
    isCover: row.is_cover,
    expectedSourceSizeBytes: row.expected_source_size_bytes,
    expectedContentType: row.expected_content_type as ProductPublicationItem["expectedContentType"],
    sourceSha256: row.source_sha256,
    status: parseItemStatus(row.status),
    attemptToken: row.attempt_token,
    publicSizeBytes: row.public_size_bytes,
    publicSha256: row.public_sha256,
    publicEtag: row.public_etag,
    publicUrl: row.public_url,
    objectCreatedByAttemptToken: row.object_created_by_attempt_token,
    errorCode: row.error_code,
  };
}

function parseRunStatus(value: string): ProductPublicationStatus {
  return parseResult(value, ["pending", "running", "failed", "cleanup_required", "completed"]);
}

function parseItemStatus(value: string): ProductPublicationItemStatus {
  return parseResult(value, [
    "pending",
    "copying",
    "verified",
    "failed",
    "cleanup_required",
    "completed",
  ]);
}

function parseResult<T extends string>(value: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`Unexpected product publication database result: ${value}`);
}

function throwDatabaseError(error: { message: string }): never {
  console.error("[Product publication] Database operation failed.", error);
  throw new Error("Product publication database operation failed.");
}

function isCategoryRequired(error: { message: string }): boolean {
  return error.message.includes("product_publication_category_required");
}
