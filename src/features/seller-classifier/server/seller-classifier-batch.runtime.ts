import { ClassifierBatchProvisioningClient } from "./classifier-batch-provisioning-api";
import { HttpClassifierReviewClient } from "./classifier-review-api";
import { HttpClassifierMultimodalComparisonClient } from "./classifier-multimodal-comparison-api";
import { HttpClassifierWorkflowClient } from "./classifier-workflow-api";
import { ApprovedGroupsClient } from "@/features/admin/server/classifier-approved-groups.service";
import { LocalClassifierImportDispatcher } from "@/features/admin/server/classifier-import.dispatcher";
import { readClassifierImportConfig } from "@/features/admin/server/classifier-import.config";
import { createClassifierImportWorkerRuntime } from "@/features/admin/server/classifier-import.runtime";
import { readSellerClassifierBatchConfig } from "./seller-classifier-batch.config";
import {
  SellerClassifierBatchOwnershipService,
  SellerClassifierBatchService,
} from "./seller-classifier-batch.service";
import { SellerClassifierWorkflowService } from "./seller-classifier-workflow.service";
import { SellerClassifierReviewService } from "./seller-classifier-review.service";
import { SellerClassifierComparisonService } from "./seller-classifier-comparison.service";
import { SellerClassifierImportService } from "./seller-classifier-import.service";
import { SupabaseSellerClassifierBatchRepository } from "./supabase-seller-classifier-batch.repository";
import { SupabaseSellerClassifierImportRepository } from "./supabase-seller-classifier-import.repository";

let servicePromise: Promise<SellerClassifierBatchService> | undefined;
let ownershipServicePromise: Promise<SellerClassifierBatchOwnershipService> | undefined;
let workflowServicePromise: Promise<SellerClassifierWorkflowService> | undefined;
let reviewServicePromise: Promise<SellerClassifierReviewService> | undefined;
let comparisonServicePromise: Promise<SellerClassifierComparisonService> | undefined;
let importServicePromise: Promise<SellerClassifierImportService> | undefined;

export function getSellerClassifierBatchService(): Promise<SellerClassifierBatchService> {
  servicePromise ??= createSellerClassifierBatchService();
  return servicePromise;
}

export function getSellerClassifierBatchOwnershipService(): Promise<SellerClassifierBatchOwnershipService> {
  ownershipServicePromise ??= createSellerClassifierBatchOwnershipService();
  return ownershipServicePromise;
}

export function getSellerClassifierWorkflowService(): Promise<SellerClassifierWorkflowService> {
  workflowServicePromise ??= createSellerClassifierWorkflowService();
  return workflowServicePromise;
}

export function getSellerClassifierReviewService(): Promise<SellerClassifierReviewService> {
  reviewServicePromise ??= createSellerClassifierReviewService();
  return reviewServicePromise;
}

export function getSellerClassifierComparisonService(): Promise<SellerClassifierComparisonService> {
  comparisonServicePromise ??= createSellerClassifierComparisonService();
  return comparisonServicePromise;
}

export function getSellerClassifierImportService(): Promise<SellerClassifierImportService> {
  importServicePromise ??= createSellerClassifierImportService();
  return importServicePromise;
}

export async function createSellerClassifierBatchService(): Promise<SellerClassifierBatchService> {
  const config = readSellerClassifierBatchConfig();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new SellerClassifierBatchService(
    new SupabaseSellerClassifierBatchRepository(supabaseAdmin),
    new ClassifierBatchProvisioningClient({
      baseUrl: config.classifierApiBaseUrl,
      timeoutMs: config.classifierBatchCreateTimeoutMs,
    }),
    config.classifierOrganizationId,
  );
}

async function createSellerClassifierBatchOwnershipService(): Promise<SellerClassifierBatchOwnershipService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new SellerClassifierBatchOwnershipService(
    new SupabaseSellerClassifierBatchRepository(supabaseAdmin),
  );
}

async function createSellerClassifierWorkflowService(): Promise<SellerClassifierWorkflowService> {
  const config = readSellerClassifierBatchConfig();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new SellerClassifierWorkflowService(
    new SupabaseSellerClassifierBatchRepository(supabaseAdmin),
    new HttpClassifierWorkflowClient({
      baseUrl: config.classifierApiBaseUrl,
      timeoutMs: config.classifierCommandTimeoutMs,
    }),
    config.classifierOrganizationId,
  );
}

async function createSellerClassifierReviewService(): Promise<SellerClassifierReviewService> {
  const config = readSellerClassifierBatchConfig();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new SellerClassifierReviewService(
    new SupabaseSellerClassifierBatchRepository(supabaseAdmin),
    new HttpClassifierReviewClient({
      baseUrl: config.classifierApiBaseUrl,
      timeoutMs: config.classifierCommandTimeoutMs,
    }),
    config.classifierOrganizationId,
  );
}

async function createSellerClassifierComparisonService(): Promise<SellerClassifierComparisonService> {
  const config = readSellerClassifierBatchConfig();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new SellerClassifierComparisonService(
    new SupabaseSellerClassifierBatchRepository(supabaseAdmin),
    new HttpClassifierMultimodalComparisonClient({
      baseUrl: config.classifierApiBaseUrl,
      timeoutMs: config.classifierCommandTimeoutMs,
    }),
    config.classifierOrganizationId,
  );
}

async function createSellerClassifierImportService(): Promise<SellerClassifierImportService> {
  const config = readClassifierImportConfig();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const dispatcher = new LocalClassifierImportDispatcher(() =>
    createClassifierImportWorkerRuntime(undefined, config),
  );
  return new SellerClassifierImportService(
    new SupabaseSellerClassifierBatchRepository(supabaseAdmin),
    new SupabaseSellerClassifierImportRepository(supabaseAdmin),
    await getSellerClassifierReviewService(),
    new ApprovedGroupsClient({
      baseUrl: config.classifierApiBaseUrl,
      timeoutMs: config.approvedGroupsTimeoutMs,
    }),
    dispatcher,
    config.classifierOrganizationId,
    config.importRunLeaseTimeoutSeconds,
  );
}
