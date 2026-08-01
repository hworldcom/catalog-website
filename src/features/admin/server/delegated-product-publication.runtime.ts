import { ProductDraftDescriptionService } from "@/features/product-draft-descriptions/product-draft-descriptions.service";
import { SupabaseProductDraftDescriptionRepository } from "@/features/product-draft-descriptions/server/supabase-product-draft-descriptions.repository";
import { ProductDraftFactsService } from "@/features/product-draft-facts/product-draft-facts.service";
import { SupabaseProductDraftFactsRepository } from "@/features/product-draft-facts/server/supabase-product-draft-facts.repository";
import { createProductDraftTitlePersistenceService } from "@/features/product-draft-title/server/product-draft-title.runtime";
import { createSellerProductDraftImageGalleryService } from "@/features/seller/server/seller-product-draft-image-gallery.runtime";
import { createSellerProductPublicationService } from "@/features/seller/server/seller-product-publication.runtime";

import { readDelegatedAdministratorActionConfig } from "./delegated-administrator-action.config";
import { DelegatedAdministratorActionService } from "./delegated-administrator-action.service";
import { DelegatedProductPublicationService } from "./delegated-product-publication.service";
import { SupabaseDelegatedAdministratorActionRepository } from "./supabase-delegated-administrator-action.repository";
import { SupabaseDelegatedProductPublicationRepository } from "./supabase-delegated-product-publication.repository";

let servicePromise: Promise<DelegatedProductPublicationService> | undefined;

export function getDelegatedProductPublicationService(): Promise<DelegatedProductPublicationService> {
  servicePromise ??= createDelegatedProductPublicationService();
  return servicePromise;
}

export async function createDelegatedProductPublicationService(): Promise<DelegatedProductPublicationService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const actionRepository = new SupabaseDelegatedAdministratorActionRepository(supabaseAdmin);
  return new DelegatedProductPublicationService(
    new SupabaseDelegatedProductPublicationRepository(supabaseAdmin),
    await createProductDraftTitlePersistenceService(),
    new ProductDraftFactsService(new SupabaseProductDraftFactsRepository(supabaseAdmin)),
    new ProductDraftDescriptionService(
      new SupabaseProductDraftDescriptionRepository(supabaseAdmin),
    ),
    await createSellerProductDraftImageGalleryService(),
    await createSellerProductPublicationService(),
    new DelegatedAdministratorActionService(
      actionRepository,
      readDelegatedAdministratorActionConfig(),
    ),
  );
}
