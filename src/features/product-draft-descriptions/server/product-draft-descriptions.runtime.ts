import type { SupabaseClient } from "@supabase/supabase-js";

import { assertPrototypeAdministrator } from "@/features/admin/server/prototype-administrator-access";
import {
  getCurrentSellerId,
  type SellerLookupSupabase,
} from "@/features/seller/server/current-seller.service";
import type { Database } from "@/lib/supabase/types";

import { ProductDraftDescriptionService } from "../product-draft-descriptions.service";
import { ProductDraftDescriptionError } from "../product-draft-descriptions.types";
import { SupabaseProductDraftDescriptionRepository } from "./supabase-product-draft-descriptions.repository";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export async function createProductDraftDescriptionRequestContext(
  context: AuthenticatedContext,
): Promise<{
  service: ProductDraftDescriptionService;
  access: { mode: "prototype_administrator" };
}> {
  assertPrototypeAdministrator(context.userId);
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return {
    service: new ProductDraftDescriptionService(
      new SupabaseProductDraftDescriptionRepository(supabaseAdmin),
    ),
    access: { mode: "prototype_administrator" },
  };
}

export async function createSellerProductDraftDescriptionRequestContext(
  context: AuthenticatedContext,
): Promise<{
  service: ProductDraftDescriptionService;
  access: { mode: "seller"; expectedSellerId: string };
}> {
  let sellerId: string | null;
  try {
    sellerId = await getCurrentSellerId({
      supabase: context.supabase as unknown as SellerLookupSupabase,
      userId: context.userId,
    });
  } catch (error) {
    console.error("[ProductDraft descriptions] Seller lookup failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw new ProductDraftDescriptionError(
      500,
      "product_draft_description_unavailable",
      "ProductDraft descriptions are temporarily unavailable.",
    );
  }
  if (!sellerId) {
    throw new ProductDraftDescriptionError(
      404,
      "product_draft_not_found",
      "The ProductDraft was not found.",
    );
  }

  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return {
    service: new ProductDraftDescriptionService(
      new SupabaseProductDraftDescriptionRepository(supabaseAdmin),
    ),
    access: { mode: "seller", expectedSellerId: sellerId },
  };
}
