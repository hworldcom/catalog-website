import { readProductPublicationConfig } from "./product-publication.config";
import { LocalProductPublicationDispatcher } from "./product-publication.dispatcher";
import { SupabaseProductPublicationRepository } from "./supabase-product-publication.repository";
import { ProductPublicationService } from "./product-publication.service";
import { SupabaseProductPublicationStorage } from "./product-publication.storage";
import { ProductPublicationWorker } from "./product-publication.worker";

let servicePromise: Promise<ProductPublicationService> | undefined;

export function getProductPublicationService(): Promise<ProductPublicationService> {
  servicePromise ??= createProductPublicationService();
  return servicePromise;
}

export async function createProductPublicationWorkerRuntime(): Promise<ProductPublicationWorker> {
  const config = readProductPublicationConfig();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new ProductPublicationWorker(
    new SupabaseProductPublicationRepository(supabaseAdmin),
    new SupabaseProductPublicationStorage({
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey,
    }),
    config,
  );
}

async function createProductPublicationService(): Promise<ProductPublicationService> {
  const config = readProductPublicationConfig();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const repository = new SupabaseProductPublicationRepository(supabaseAdmin);
  const dispatcher = new LocalProductPublicationDispatcher(
    () => createProductPublicationWorkerRuntime(),
    undefined,
    undefined,
    async (productDraftId) => {
      await repository.markDispatchFailed(productDraftId);
    },
  );
  return new ProductPublicationService(
    repository,
    dispatcher,
    async (productDraftId) =>
      (await createProductPublicationWorkerRuntime()).reconcileCleanup(productDraftId),
    true,
  );
}
