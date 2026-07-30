import {
  getSellerClassifierBatchService,
  getSellerClassifierWorkflowService,
} from "@/features/seller-classifier/server/seller-classifier-batch.runtime";

import { DelegatedClassifierUploadService } from "./delegated-classifier-upload.service";
import { SupabaseDelegatedClassifierUploadRepository } from "./supabase-delegated-classifier-upload.repository";

let servicePromise: Promise<DelegatedClassifierUploadService> | undefined;

export function getDelegatedClassifierUploadService(): Promise<DelegatedClassifierUploadService> {
  servicePromise ??= createDelegatedClassifierUploadService();
  return servicePromise;
}

export async function createDelegatedClassifierUploadService(): Promise<DelegatedClassifierUploadService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new DelegatedClassifierUploadService(
    new SupabaseDelegatedClassifierUploadRepository(supabaseAdmin),
    await getSellerClassifierBatchService(),
    await getSellerClassifierWorkflowService(),
  );
}
