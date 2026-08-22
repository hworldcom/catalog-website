import type { ProductActivationWorkerConfig } from "./product-activation.worker-config";
import {
  SupabaseProductActivationRepository,
  type ProductActivationAdministrator,
  type ProductActivationRepository,
} from "./product-activation.repository";
import { ProductActivationWorker } from "./product-activation.worker";
import { SupabaseProductPublicationStorage } from "@/features/seller/server/product-publication.storage";

export type ProductActivationTaskRuntimeDependencies = {
  getRepository(): Promise<Pick<ProductActivationRepository, "recordDispatchResult">>;
  createWorker(): Promise<Pick<ProductActivationWorker, "run">>;
};

export function createProductActivationTaskRuntimeDependencies(
  config: ProductActivationWorkerConfig,
): ProductActivationTaskRuntimeDependencies {
  let repositoryPromise: Promise<ProductActivationRepository> | undefined;
  const getRepository = () => {
    repositoryPromise ??= createRepository();
    return repositoryPromise;
  };

  return {
    getRepository,
    async createWorker() {
      const repository = await getRepository();
      const storage = new SupabaseProductPublicationStorage({
        supabaseUrl: config.supabaseUrl,
        serviceRoleKey: config.serviceRoleKey,
      });
      return new ProductActivationWorker(repository, storage, config);
    },
  };
}

async function createRepository(): Promise<ProductActivationRepository> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new SupabaseProductActivationRepository(
    supabaseAdmin as unknown as ProductActivationAdministrator,
  );
}
