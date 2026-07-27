import { SupabaseDestinationImageStorage } from "./destination-image-storage";
import {
  readLegacyProductDraftImageCutoverConfig,
  type LegacyProductDraftImageCutoverConfig,
} from "./legacy-product-draft-image-cutover.config";
import { LegacyProductDraftImageCutoverService } from "./legacy-product-draft-image-cutover.service";
import { SupabaseLegacyProductDraftImageCutoverRepository } from "./supabase-legacy-product-draft-image-cutover.repository";

export async function createLegacyProductDraftImageCutoverRuntime(
  config: LegacyProductDraftImageCutoverConfig = readLegacyProductDraftImageCutoverConfig(),
): Promise<LegacyProductDraftImageCutoverService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new LegacyProductDraftImageCutoverService(
    new SupabaseLegacyProductDraftImageCutoverRepository(supabaseAdmin),
    new SupabaseDestinationImageStorage({
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey,
      headTimeoutMs: config.storageHeadTimeoutMs,
      writeTimeoutMs: config.storageWriteTimeoutMs,
    }),
  );
}
