import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";

import type {
  ClassifierImagePromotionRepository,
  PreparePromotionGroupResult,
  PromotionWorkItem,
} from "./classifier-image-promotion.repository";
import type { ApprovedGroup, ImageImportActionState } from "./classifier-import.types";
import { parseProductImageStorageBucket } from "./destination-image-storage";

type AdminClient = SupabaseClient<Database>;
type PromotionRow = Database["public"]["Tables"]["product_draft_image_promotions"]["Row"];
type PromotionWithImage = PromotionRow & {
  product_draft_images:
    | {
        destination_key: string;
        source_position: number;
        storage_bucket: string;
      }
    | {
        destination_key: string;
        source_position: number;
        storage_bucket: string;
      }[];
};

function throwDatabaseError(error: { message: string }): never {
  throw new Error(`Classifier image-promotion database operation failed: ${error.message}`);
}

export class SupabaseClassifierImagePromotionRepository implements ClassifierImagePromotionRepository {
  constructor(private readonly database: AdminClient) {}

  async prepareGroup(
    importId: string,
    runAttemptToken: string,
    group: ApprovedGroup,
  ): Promise<PreparePromotionGroupResult> {
    const response = await this.database.rpc("prepare_classifier_import_group_images", {
      p_import_id: importId,
      p_run_attempt_token: runAttemptToken,
      p_classifier_group_id: group.groupId,
      p_cover_classifier_image_id: group.coverImageId,
      p_memberships: group.images.map((image) => ({
        image_id: image.imageId,
        source_position: image.position,
        is_duplicate: image.isDuplicate,
        duplicate_of_image_id: image.duplicateOfImageId,
      })) as Json,
    });
    if (response.error) throwDatabaseError(response.error);
    const row = response.data?.[0];
    if (!row) throw new Error("Classifier promotion group preparation returned no result.");

    if (row.result === "prepared" && row.product_draft_id) {
      return { result: "prepared", productDraftId: row.product_draft_id };
    }
    if (
      row.result === "claim_lost" ||
      row.result === "group_not_prepared" ||
      row.result === "source_membership_conflict"
    ) {
      return { result: row.result };
    }
    throw new Error(`Unexpected promotion group preparation result: ${row.result}`);
  }

  async listGroupPromotions(productDraftId: string): Promise<PromotionWorkItem[]> {
    const response = await this.database
      .from("product_draft_image_promotions")
      .select("*, product_draft_images!inner(destination_key,source_position,storage_bucket)")
      .eq("product_draft_id", productDraftId);
    if (response.error) throwDatabaseError(response.error);
    return mapPromotionRows(response.data as unknown as PromotionWithImage[]);
  }

  async listPromotedRunImages(input: {
    classifierOrganizationId: string;
    classifierBatchId: string;
  }): Promise<PromotionWorkItem[]> {
    const response = await this.database
      .from("product_draft_image_promotions")
      .select("*, product_draft_images!inner(destination_key,source_position,storage_bucket)")
      .eq("classifier_organization_id", input.classifierOrganizationId)
      .eq("classifier_batch_id", input.classifierBatchId)
      .eq("status", "promoted");
    if (response.error) throwDatabaseError(response.error);
    return mapPromotionRows(response.data as unknown as PromotionWithImage[]);
  }

  async claimPromotion(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
    claimTimeoutSeconds: number;
  }): Promise<PromotionWorkItem | null> {
    const response = await this.database.rpc("claim_classifier_image_promotion", {
      p_import_id: input.importId,
      p_run_attempt_token: input.runAttemptToken,
      p_promotion_id: input.promotionId,
      p_claim_timeout_seconds: input.claimTimeoutSeconds,
    });
    if (response.error) throwDatabaseError(response.error);
    const promotion = response.data?.[0];
    if (!promotion) return null;

    const draftImage = await this.database
      .from("product_draft_images")
      .select("destination_key,source_position,storage_bucket")
      .eq("id", promotion.product_draft_image_id)
      .single();
    if (draftImage.error) throwDatabaseError(draftImage.error);
    return {
      ...promotion,
      destinationKey: draftImage.data.destination_key,
      sourcePosition: draftImage.data.source_position,
      storageBucket: parseProductImageStorageBucket(draftImage.data.storage_bucket),
    };
  }

  async verifyClaim(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
    promotionAttemptToken: string;
  }): Promise<boolean> {
    const response = await this.database.rpc("verify_classifier_image_promotion_claim", {
      p_import_id: input.importId,
      p_run_attempt_token: input.runAttemptToken,
      p_promotion_id: input.promotionId,
      p_promotion_attempt_token: input.promotionAttemptToken,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async heartbeatRun(importId: string, runAttemptToken: string): Promise<boolean> {
    const response = await this.database.rpc("heartbeat_classifier_import_run", {
      p_import_id: importId,
      p_attempt_token: runAttemptToken,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async setSourceContentLength(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
    promotionAttemptToken: string;
    sourceContentLength: number;
  }): Promise<boolean> {
    const response = await this.database.rpc("set_classifier_image_promotion_source_length", {
      p_import_id: input.importId,
      p_run_attempt_token: input.runAttemptToken,
      p_promotion_id: input.promotionId,
      p_promotion_attempt_token: input.promotionAttemptToken,
      p_source_content_length: input.sourceContentLength,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async finalizeSuccess(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
    promotionAttemptToken: string;
    destinationSizeBytes: number;
  }): Promise<boolean> {
    const response = await this.database.rpc("finalize_classifier_image_promotion_success", {
      p_import_id: input.importId,
      p_run_attempt_token: input.runAttemptToken,
      p_promotion_id: input.promotionId,
      p_promotion_attempt_token: input.promotionAttemptToken,
      p_destination_size_bytes: input.destinationSizeBytes,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async finalizeFailure(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
    promotionAttemptToken: string;
    errorCode: string;
    retryable: boolean;
  }): Promise<boolean> {
    const response = await this.database.rpc("finalize_classifier_image_promotion_failure", {
      p_import_id: input.importId,
      p_run_attempt_token: input.runAttemptToken,
      p_promotion_id: input.promotionId,
      p_promotion_attempt_token: input.promotionAttemptToken,
      p_error_code: input.errorCode,
      p_retryable: input.retryable,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async getActionState(importId: string): Promise<ImageImportActionState> {
    const response = await this.database.rpc("classifier_import_image_action_state", {
      p_import_id: importId,
    });
    if (response.error) throwDatabaseError(response.error);
    const row = response.data?.[0];
    return {
      hasRetryableFailures: row?.has_retryable_failures ?? false,
      hasAnyFailures: row?.has_any_failures ?? false,
      hasPromotedImages: row?.has_promoted_images ?? false,
    };
  }

  async resetMissing(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
  }): Promise<boolean> {
    const response = await this.database.rpc("reset_missing_classifier_image_promotion", {
      p_import_id: input.importId,
      p_run_attempt_token: input.runAttemptToken,
      p_promotion_id: input.promotionId,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async markConflict(input: {
    importId: string;
    runAttemptToken: string;
    promotionId: string;
  }): Promise<boolean> {
    const response = await this.database.rpc("mark_classifier_image_promotion_conflict", {
      p_import_id: input.importId,
      p_run_attempt_token: input.runAttemptToken,
      p_promotion_id: input.promotionId,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }
}

function mapPromotionRows(rows: PromotionWithImage[]): PromotionWorkItem[] {
  return rows
    .map((row) => {
      const relation = Array.isArray(row.product_draft_images)
        ? row.product_draft_images[0]
        : row.product_draft_images;
      if (!relation) {
        throw new Error("Classifier promotion has no linked draft image.");
      }
      const { product_draft_images: _relation, ...promotion } = row;
      return {
        ...promotion,
        destinationKey: relation.destination_key,
        sourcePosition: relation.source_position,
        storageBucket: parseProductImageStorageBucket(relation.storage_bucket),
      };
    })
    .sort(
      (left, right) =>
        left.sourcePosition - right.sourcePosition ||
        left.classifier_image_id.localeCompare(right.classifier_image_id),
    );
}
