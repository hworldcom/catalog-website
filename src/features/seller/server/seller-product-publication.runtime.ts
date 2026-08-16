import type { SellerProductPublicationInput } from "../seller-product-write.types";
import { getProductPublicationService } from "./product-publication.runtime";
import { SellerProductPublicationService } from "./seller-product-publication.service";
import { SupabaseSellerProductPublicationRepository } from "./supabase-seller-product-publication.repository";

export async function createSellerProductPublicationService(): Promise<SellerProductPublicationService> {
  const [{ supabaseAdmin }, publications, { createProductDraftTitlePersistenceService }] =
    await Promise.all([
      import("@/lib/supabase/client.server"),
      getProductPublicationService(),
      import("@/features/product-draft-title/server/product-draft-title.runtime"),
    ]);
  const titlePersistence = await createProductDraftTitlePersistenceService();

  return new SellerProductPublicationService(
    new SupabaseSellerProductPublicationRepository(supabaseAdmin),
    publications,
    async ({ sellerId, product }) =>
      titlePersistence.saveSellerProduct({
        productDraftId: product.id,
        expectedModerationRevision: product.expectedModerationRevision,
        sellerId,
        title: product.title,
        productFields: directProductFields(product),
      }),
  );
}

function directProductFields(product: SellerProductPublicationInput) {
  return {
    audiences: product.audiences,
    ...("description" in product ? { description: product.description } : {}),
    category_id: product.category_id ?? null,
    moq: product.moq ?? null,
    pack_size: product.pack_size || null,
    price: product.price ?? null,
    currency: product.currency,
    stock: product.stock,
    ...("cover_image_url" in product ? { cover_image_url: product.cover_image_url || null } : {}),
    trending: product.trending,
    status: "published" as const,
  };
}
