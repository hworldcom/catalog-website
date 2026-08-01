import {
  getSellerClassifierImportService,
  getSellerClassifierReviewService,
} from "@/features/seller-classifier/server/seller-classifier-batch.runtime";

import { readDelegatedAdministratorActionConfig } from "./delegated-administrator-action.config";
import { DelegatedAdministratorActionService } from "./delegated-administrator-action.service";
import { DelegatedClassifierReviewImportService } from "./delegated-classifier-review-import.service";
import { SupabaseDelegatedAdministratorActionRepository } from "./supabase-delegated-administrator-action.repository";
import { SupabaseDelegatedClassifierUploadRepository } from "./supabase-delegated-classifier-upload.repository";

let servicePromise: Promise<DelegatedClassifierReviewImportService> | undefined;

export function getDelegatedClassifierReviewImportService(): Promise<DelegatedClassifierReviewImportService> {
  servicePromise ??= createDelegatedClassifierReviewImportService();
  return servicePromise;
}

export async function createDelegatedClassifierReviewImportService(): Promise<DelegatedClassifierReviewImportService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const actionRepository = new SupabaseDelegatedAdministratorActionRepository(supabaseAdmin);
  return new DelegatedClassifierReviewImportService(
    new SupabaseDelegatedClassifierUploadRepository(supabaseAdmin),
    await getSellerClassifierReviewService(),
    await getSellerClassifierImportService(),
    new DelegatedAdministratorActionService(
      actionRepository,
      readDelegatedAdministratorActionConfig(),
    ),
    actionRepository,
  );
}
