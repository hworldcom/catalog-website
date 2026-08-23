import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import { ApprovedGroupsClient } from "./classifier-approved-groups.service";
import { ClassifierImagePromotionService } from "./classifier-image-promotion.service";
import { ClassifierNormalizedImageClient } from "./classifier-normalized-image.service";
import { LocalClassifierImportDispatcher } from "./classifier-import.dispatcher";
import {
  readClassifierImportConfig,
  type ClassifierImportConfig,
} from "./classifier-import.config";
import { ClassifierImportCoordinator } from "./classifier-import.coordinator";
import type { GroupImagePreparationService } from "./classifier-import.types";
import { SupabaseClassifierImagePromotionRepository } from "./supabase-classifier-image-promotion.repository";
import { SupabaseClassifierImportRepository } from "./supabase-classifier-import.repository";
import { SupabaseDestinationImageStorage } from "./destination-image-storage";

let coordinatorPromise: Promise<ClassifierImportCoordinator> | undefined;

export function getClassifierImportCoordinator(): Promise<ClassifierImportCoordinator> {
  coordinatorPromise ??= createCoordinator();
  return coordinatorPromise;
}

async function createCoordinator(): Promise<ClassifierImportCoordinator> {
  const config = readClassifierImportConfig();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const repository = new SupabaseClassifierImportRepository(supabaseAdmin);
  const imagePreparation = createProductionImagePreparationService(supabaseAdmin, config);
  const dispatcher = new LocalClassifierImportDispatcher(() =>
    createClassifierImportWorkerRuntime(undefined, config),
  );
  return new ClassifierImportCoordinator(repository, imagePreparation, config, dispatcher);
}

export async function createClassifierImportWorkerRuntime(
  imagePreparation?: GroupImagePreparationService,
  config: ClassifierImportConfig = readClassifierImportConfig(),
) {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const repository = new SupabaseClassifierImportRepository(supabaseAdmin);
  const approvedGroups = new ApprovedGroupsClient({
    baseUrl: config.classifierApiBaseUrl,
    timeoutMs: config.approvedGroupsTimeoutMs,
  });
  const productionImagePreparation =
    imagePreparation ?? createProductionImagePreparationService(supabaseAdmin, config);
  const { ClassifierImportWorker } = await import("./classifier-import.worker");
  return new ClassifierImportWorker(repository, approvedGroups, productionImagePreparation, config);
}

export async function runNextClassifierImport() {
  const worker = await createClassifierImportWorkerRuntime();
  return worker.runNext();
}

function createProductionImagePreparationService(
  database: SupabaseClient<Database>,
  config: ReturnType<typeof readClassifierImportConfig>,
): GroupImagePreparationService {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Classifier image promotion requires Supabase server credentials.");
  }

  return new ClassifierImagePromotionService(
    new SupabaseClassifierImagePromotionRepository(database),
    new ClassifierNormalizedImageClient({
      baseUrl: config.classifierApiBaseUrl,
      timeoutMs: config.normalizedImageReadTimeoutMs,
    }),
    new SupabaseDestinationImageStorage({
      supabaseUrl,
      serviceRoleKey,
      headTimeoutMs: config.storageHeadTimeoutMs,
      writeTimeoutMs: config.storageWriteTimeoutMs,
    }),
    config,
  );
}
