import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import {
  DelegatedProductPublicationRepositoryError,
  type DelegatedProductDraftRecord,
  type DelegatedProductPublicationRepository,
  type DelegatedProductPublicationRunRecord,
} from "./delegated-product-publication.repository";

type AdminClient = SupabaseClient<Database>;

const publicationStatuses = [
  "pending",
  "running",
  "failed",
  "cleanup_required",
  "completed",
] as const;

export class SupabaseDelegatedProductPublicationRepository implements DelegatedProductPublicationRepository {
  constructor(private readonly database: AdminClient) {}

  async findAdministratorWorkflow(workflowId: string): Promise<{
    workflowId: string;
    sellerId: string;
    classifierOrganizationId: string;
    classifierBatchId: string | null;
  } | null> {
    const response = await this.database
      .from("seller_classifier_batches")
      .select("id,seller_id,initiator_kind,classifier_organization_id,classifier_batch_id")
      .eq("id", workflowId)
      .maybeSingle();
    if (response.error) throw databaseError(response.error);
    if (!response.data || response.data.initiator_kind !== "administrator") return null;
    return {
      workflowId: response.data.id,
      sellerId: response.data.seller_id,
      classifierOrganizationId: response.data.classifier_organization_id,
      classifierBatchId: response.data.classifier_batch_id,
    };
  }

  async resolve(
    workflowId: string,
    productDraftId: string,
  ): Promise<DelegatedProductDraftRecord | null> {
    const workflow = await this.findAdministratorWorkflow(workflowId);
    if (!workflow) return null;

    const runs = await this.database
      .from("classifier_import_runs")
      .select("id,seller_id,classifier_organization_id,classifier_batch_id")
      .eq("seller_classifier_workflow_id", workflowId);
    if (runs.error) throw databaseError(runs.error);
    if (runs.data?.length !== 1) return null;
    const run = runs.data[0]!;
    if (
      run.seller_id !== workflow.sellerId ||
      run.classifier_organization_id !== workflow.classifierOrganizationId ||
      !workflow.classifierBatchId ||
      run.classifier_batch_id !== workflow.classifierBatchId
    ) {
      return null;
    }

    const outcomes = await this.database
      .from("classifier_import_group_outcomes")
      .select("classifier_group_id,product_draft_id")
      .eq("classifier_import_run_id", run.id)
      .eq("product_draft_id", productDraftId);
    if (outcomes.error) throw databaseError(outcomes.error);
    if (outcomes.data?.length !== 1) return null;
    const outcome = outcomes.data[0]!;

    const [productResponse, sellerResponse, membershipsResponse] = await Promise.all([
      this.database.from("products").select("*").eq("id", productDraftId).maybeSingle(),
      this.database
        .from("sellers")
        .select("id,name,slug,published")
        .eq("id", workflow.sellerId)
        .maybeSingle(),
      this.database
        .from("product_draft_source_memberships")
        .select(
          "classifier_organization_id,classifier_batch_id,classifier_group_id,product_draft_id",
        )
        .eq("product_draft_id", productDraftId),
    ]);
    for (const response of [productResponse, sellerResponse, membershipsResponse]) {
      if (response.error) throw databaseError(response.error);
    }
    if (
      !productResponse.data ||
      !sellerResponse.data ||
      productResponse.data.seller_id !== workflow.sellerId ||
      !membershipsResponse.data?.length
    ) {
      return null;
    }
    if (
      membershipsResponse.data.some(
        (membership) =>
          membership.product_draft_id !== productDraftId ||
          membership.classifier_organization_id !== run.classifier_organization_id ||
          membership.classifier_batch_id !== run.classifier_batch_id ||
          membership.classifier_group_id !== outcome.classifier_group_id,
      )
    ) {
      return null;
    }

    return {
      workflowId,
      seller: sellerResponse.data,
      source: {
        classifierOrganizationId: run.classifier_organization_id,
        classifierBatchId: run.classifier_batch_id,
        classifierGroupId: outcome.classifier_group_id,
      },
      product: productResponse.data,
    };
  }

  async listCategories() {
    const response = await this.database
      .from("categories")
      .select("id,slug,name")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (response.error) throw databaseError(response.error);
    return response.data ?? [];
  }

  async categoryExists(categoryId: string): Promise<boolean> {
    const response = await this.database
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .maybeSingle();
    if (response.error) throw databaseError(response.error);
    return response.data !== null;
  }

  async getPublicationRun(
    productDraftId: string,
    sellerId: string,
  ): Promise<DelegatedProductPublicationRunRecord | null> {
    const response = await this.database
      .from("product_image_publication_runs")
      .select("status,delegated_action_request_id,delegated_action_request_fingerprint")
      .eq("product_draft_id", productDraftId)
      .eq("seller_id", sellerId)
      .maybeSingle();
    if (response.error) throw databaseError(response.error);
    if (!response.data) return null;
    return {
      status: parseValue(response.data.status, publicationStatuses),
      delegatedActionRequestId: response.data.delegated_action_request_id,
      delegatedActionRequestFingerprint: response.data.delegated_action_request_fingerprint,
    };
  }
}

function parseValue<const T extends string>(value: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new DelegatedProductPublicationRepositoryError(
    "Delegated ProductDraft publication found an unexpected durable value.",
  );
}

function databaseError(error: { message: string }): DelegatedProductPublicationRepositoryError {
  console.error("[Delegated ProductDraft publication] Database operation failed.", {
    message: error.message,
  });
  return new DelegatedProductPublicationRepositoryError(
    "Delegated ProductDraft publication database operation failed.",
  );
}
