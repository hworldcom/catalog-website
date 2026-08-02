import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentSellerId,
  type SellerLookupSupabase,
} from "@/features/seller/server/current-seller.service";
import type { Database } from "@/lib/supabase/types";

import { ProductDescriptionGenerationService } from "../product-draft-description-generation.service";
import { generationError } from "../product-draft-description-generation.types";
import { OpenAIProductDescriptionGenerationProvider } from "./openai-product-description-generation.provider";
import {
  readProductDescriptionCoverImageConfig,
  SupabaseProductDescriptionCoverImageGateway,
} from "./product-description-cover-image.gateway";
import { readProductDescriptionGenerationConfig } from "./product-draft-description-generation.config";
import { SupabaseProductDraftDescriptionGenerationRepository } from "./supabase-product-draft-description-generation.repository";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export async function generateProductDraftDescriptionsForCurrentSeller(
  context: AuthenticatedContext,
  productDraftId: string,
) {
  let sellerId: string | null;
  try {
    sellerId = await getCurrentSellerId({
      supabase: context.supabase as unknown as SellerLookupSupabase,
      userId: context.userId,
    });
  } catch (error) {
    console.error("[Product description generation] Seller lookup failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw generationError(
      500,
      "product_description_generation_unavailable",
      "Product description generation is temporarily unavailable.",
    );
  }
  if (!sellerId) {
    throw generationError(404, "product_draft_not_found", "The ProductDraft was not found.");
  }

  const config = readProductDescriptionGenerationConfig();
  const coverImageConfig = readProductDescriptionCoverImageConfig();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const service = new ProductDescriptionGenerationService(
    new SupabaseProductDraftDescriptionGenerationRepository(supabaseAdmin),
    new OpenAIProductDescriptionGenerationProvider(config),
    new SupabaseProductDescriptionCoverImageGateway(coverImageConfig),
  );
  return service.generate(productDraftId, sellerId);
}
