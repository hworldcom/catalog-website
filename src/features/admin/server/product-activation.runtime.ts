import { readProductActivationConfig } from "./product-activation.config";
import { LocalProductActivationDispatcher } from "./product-activation.dispatcher";
import {
  SupabaseProductActivationRepository,
  type ProductActivationAdministrator,
  type ProductActivationRepository,
} from "./product-activation.repository";
import { ProductActivationWorker } from "./product-activation.worker";
import { SupabaseProductPublicationStorage } from "@/features/seller/server/product-publication.storage";

export type ProductActivationRuntime = {
  repository: ProductActivationRepository;
  dispatcher: LocalProductActivationDispatcher;
};

let runtimePromise: Promise<ProductActivationRuntime> | undefined;

export function getProductActivationRuntime(): Promise<ProductActivationRuntime> {
  runtimePromise ??= createProductActivationRuntime();
  return runtimePromise;
}

export async function createProductActivationRuntime(): Promise<ProductActivationRuntime> {
  const config = readProductActivationConfig();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const repository = new SupabaseProductActivationRepository(
    supabaseAdmin as unknown as ProductActivationAdministrator,
  );
  const storage = new SupabaseProductPublicationStorage({
    supabaseUrl: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey,
  });
  const dispatcher = new LocalProductActivationDispatcher(
    repository,
    async () => new ProductActivationWorker(repository, storage, config),
    config,
  );
  return { repository, dispatcher };
}

export async function startProductActivationRecovery(): Promise<void> {
  const runtime = await getProductActivationRuntime();
  runtime.dispatcher.startRecovery();
}
