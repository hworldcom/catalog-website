import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type { LegacyProductDraftImageCutoverRepository } from "./legacy-product-draft-image-cutover.repository";
import type {
  LegacyProductDraftImageCutoverErrorCode,
  LegacyProductDraftImageReconciliationWorkItem,
  ProductDraftImageCutoverSummary,
} from "./legacy-product-draft-image-cutover.types";

type AdminClient = SupabaseClient<Database>;

const scanErrorCodes = new Set<LegacyProductDraftImageCutoverErrorCode>([
  "legacy_destination_unowned",
  "legacy_public_delete_failed",
]);

export class SupabaseLegacyProductDraftImageCutoverRepository implements LegacyProductDraftImageCutoverRepository {
  constructor(private readonly database: AdminClient) {}

  async claimCutover(input: { version: string; claimTimeoutSeconds: number }) {
    const response = await this.database.rpc("claim_product_draft_image_storage_cutover", {
      p_version: input.version,
      p_claim_timeout_seconds: input.claimTimeoutSeconds,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data?.[0] ?? null;
  }

  async heartbeat(version: string, attemptToken: string): Promise<boolean> {
    const response = await this.database.rpc("heartbeat_product_draft_image_storage_cutover", {
      p_version: version,
      p_attempt_token: attemptToken,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async getSummary(version: string): Promise<ProductDraftImageCutoverSummary> {
    const cutoverResponse = await this.database
      .from("product_draft_image_storage_cutovers")
      .select("*")
      .eq("version", version)
      .maybeSingle();
    if (cutoverResponse.error) throwDatabaseError(cutoverResponse.error);
    if (!cutoverResponse.data) {
      throw new Error("ProductDraft image storage cutover state is missing.");
    }

    const failureResponse = await this.database
      .from("product_draft_image_storage_reconciliations")
      .select("error_code")
      .eq("status", "failed");
    if (failureResponse.error) throwDatabaseError(failureResponse.error);

    const failuresByCode: Record<string, number> = {};
    for (const row of failureResponse.data) {
      const code = row.error_code ?? "legacy_object_unverifiable";
      failuresByCode[code] = (failuresByCode[code] ?? 0) + 1;
    }
    return {
      cutover: cutoverResponse.data,
      failuresByCode,
    };
  }

  async claimNextReconciliation(input: {
    version: string;
    cutoverAttemptToken: string;
    claimTimeoutSeconds: number;
  }): Promise<LegacyProductDraftImageReconciliationWorkItem | null> {
    const response = await this.database.rpc(
      "claim_next_product_draft_image_storage_reconciliation",
      {
        p_version: input.version,
        p_cutover_attempt_token: input.cutoverAttemptToken,
        p_claim_timeout_seconds: input.claimTimeoutSeconds,
      },
    );
    if (response.error) throwDatabaseError(response.error);
    const row = response.data?.[0];
    if (!row) return null;
    if (!row.attempt_token || row.reconciliation_status !== "started") {
      throw new Error("Claimed ProductDraft image reconciliation is incomplete.");
    }
    return {
      destinationKey: row.destination_key,
      productDraftImageId: row.product_draft_image_id,
      reconciliationStatus: row.reconciliation_status,
      publicObjectState: row.public_object_state,
      attemptCount: row.attempt_count,
      attemptToken: row.attempt_token,
      imageStatus: row.image_status,
      storageBucket: row.storage_bucket,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      classifierOrganizationId: row.classifier_organization_id,
      classifierBatchId: row.classifier_batch_id,
      classifierGroupId: row.classifier_group_id,
      classifierImageId: row.classifier_image_id,
      sourceContentLength: row.source_content_length,
    };
  }

  async verifyReconciliationClaim(input: {
    version: string;
    cutoverAttemptToken: string;
    destinationKey: string;
    reconciliationAttemptToken: string;
  }): Promise<boolean> {
    const response = await this.database.rpc(
      "verify_product_draft_image_storage_reconciliation_claim",
      {
        p_version: input.version,
        p_cutover_attempt_token: input.cutoverAttemptToken,
        p_destination_key: input.destinationKey,
        p_reconciliation_attempt_token: input.reconciliationAttemptToken,
      },
    );
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async finalizeReconciliation(
    input: Parameters<LegacyProductDraftImageCutoverRepository["finalizeReconciliation"]>[0],
  ): Promise<boolean> {
    const response = await this.database.rpc(
      "finalize_product_draft_image_storage_reconciliation",
      {
        p_version: input.version,
        p_cutover_attempt_token: input.cutoverAttemptToken,
        p_destination_key: input.destinationKey,
        p_reconciliation_attempt_token: input.reconciliationAttemptToken,
        p_status: input.status,
        p_public_object_state: input.publicObjectState,
        p_error_code: input.errorCode,
        p_retryable: input.retryable,
        p_release_blocking: input.releaseBlocking,
        p_set_private_bucket: input.setPrivateBucket,
      },
    );
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async listPublicObjectKeys(cursor: string | null, limit: number): Promise<string[]> {
    const response = await this.database.rpc("list_legacy_product_draft_public_object_keys", {
      p_cursor: cursor,
      p_limit: limit,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data.map((row) => row.destination_key);
  }

  async recordScanObject(input: {
    version: string;
    cutoverAttemptToken: string;
    destinationKey: string;
  }): Promise<LegacyProductDraftImageCutoverErrorCode | "claim_lost"> {
    const response = await this.database.rpc("record_product_draft_image_storage_scan_object", {
      p_version: input.version,
      p_cutover_attempt_token: input.cutoverAttemptToken,
      p_destination_key: input.destinationKey,
    });
    if (response.error) throwDatabaseError(response.error);
    if (response.data === "claim_lost") return response.data;
    if (!scanErrorCodes.has(response.data as LegacyProductDraftImageCutoverErrorCode)) {
      throw new Error("ProductDraft image storage scan returned an unknown result.");
    }
    return response.data as LegacyProductDraftImageCutoverErrorCode;
  }

  async setScanProgress(
    input: Parameters<LegacyProductDraftImageCutoverRepository["setScanProgress"]>[0],
  ): Promise<boolean> {
    const response = await this.database.rpc(
      "set_product_draft_image_storage_cutover_scan_progress",
      {
        p_version: input.version,
        p_attempt_token: input.attemptToken,
        p_scan_phase: input.scanPhase,
        p_expected_cursor: input.expectedCursor,
        p_next_cursor: input.nextCursor,
      },
    );
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async beginScanPhase(
    input: Parameters<LegacyProductDraftImageCutoverRepository["beginScanPhase"]>[0],
  ): Promise<boolean> {
    const response = await this.database.rpc(
      "begin_product_draft_image_storage_cutover_scan_phase",
      {
        p_version: input.version,
        p_attempt_token: input.attemptToken,
        p_expected_phase: input.expectedPhase,
        p_next_phase: input.nextPhase,
      },
    );
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async failCutover(
    version: string,
    attemptToken: string,
    errorCode: LegacyProductDraftImageCutoverErrorCode,
  ): Promise<boolean> {
    const response = await this.database.rpc("fail_product_draft_image_storage_cutover", {
      p_version: version,
      p_attempt_token: attemptToken,
      p_error_code: errorCode,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async completeCutover(version: string, attemptToken: string): Promise<boolean> {
    const response = await this.database.rpc("complete_product_draft_image_storage_cutover", {
      p_version: version,
      p_attempt_token: attemptToken,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }
}

function throwDatabaseError(error: { message: string }): never {
  throw new Error(`ProductDraft image cutover database operation failed: ${error.message}`);
}
