import {
  readProductActivationConfig,
  type CloudTasksProductActivationSettings,
  type ProductActivationConfig,
} from "./product-activation.config";
import {
  CloudTasksProductActivationDispatcher,
  GoogleCloudProductActivationTaskClient,
  type ProductActivationTaskClient,
} from "./product-activation.cloud-tasks";
import {
  LocalProductActivationDispatcher,
  type ProductActivationDispatcher,
} from "./product-activation.dispatcher";
import {
  SupabaseProductActivationRepository,
  type ProductActivationAdministrator,
  type ProductActivationRepository,
} from "./product-activation.repository";
import { ProductActivationWorker } from "./product-activation.worker";
import {
  SupabaseProductPublicationStorage,
  type ProductPublicationStorage,
} from "@/features/seller/server/product-publication.storage";

export type ProductActivationRuntime = {
  repository: ProductActivationRepository;
  dispatcher: ProductActivationDispatcher;
  startRecovery(): void;
};

export type ProductActivationRuntimeDependencies = {
  environment?: Record<string, string | undefined>;
  createRepository?: () => Promise<ProductActivationRepository>;
  createStorage?: (config: ProductActivationConfig) => ProductPublicationStorage;
  createTaskClient?: (config: CloudTasksProductActivationSettings) => ProductActivationTaskClient;
};

let runtimePromise: Promise<ProductActivationRuntime> | undefined;

export function getProductActivationRuntime(): Promise<ProductActivationRuntime> {
  runtimePromise ??= createProductActivationRuntime();
  return runtimePromise;
}

export async function createProductActivationRuntime(
  dependencies: ProductActivationRuntimeDependencies = {},
): Promise<ProductActivationRuntime> {
  const config = readProductActivationConfig(dependencies.environment);
  const repository = await (dependencies.createRepository ?? createRepository)();

  if (config.dispatchMode === "cloud_tasks") {
    const taskClient = (dependencies.createTaskClient ?? createTaskClient)(config);
    return {
      repository,
      dispatcher: new CloudTasksProductActivationDispatcher(
        repository,
        taskClient,
        config.maximumEnqueueAttemptMs,
      ),
      startRecovery() {},
    };
  }

  const storage = (dependencies.createStorage ?? createStorage)(config);
  const dispatcher = new LocalProductActivationDispatcher(
    repository,
    async () => new ProductActivationWorker(repository, storage, config),
    config,
  );
  return { repository, dispatcher, startRecovery: () => dispatcher.startRecovery() };
}

export async function startProductActivationRuntime(): Promise<void> {
  const runtime = await getProductActivationRuntime();
  runtime.startRecovery();
}

async function createRepository(): Promise<ProductActivationRepository> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new SupabaseProductActivationRepository(
    supabaseAdmin as unknown as ProductActivationAdministrator,
  );
}

function createStorage(config: ProductActivationConfig): ProductPublicationStorage {
  return new SupabaseProductPublicationStorage({
    supabaseUrl: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey,
  });
}

function createTaskClient(
  config: CloudTasksProductActivationSettings,
): ProductActivationTaskClient {
  return new GoogleCloudProductActivationTaskClient(config);
}
