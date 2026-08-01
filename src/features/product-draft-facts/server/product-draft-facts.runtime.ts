import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentSellerId,
  type SellerLookupSupabase,
} from "@/features/seller/server/current-seller.service";
import type { Database } from "@/lib/supabase/types";

import type { ProductDraftFactsAccess } from "../product-draft-facts.service";
import { ProductDraftFactsService } from "../product-draft-facts.service";
import { ProductDraftFactsError } from "../product-draft-facts.types";
import {
  isPrototypeAdministrator,
  readPrototypeAdministratorUserIds,
} from "./product-draft-facts.access";
import { SupabaseProductDraftFactsRepository } from "./supabase-product-draft-facts.repository";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export async function createProductDraftFactsRequestContext(
  context: AuthenticatedContext,
): Promise<{
  service: ProductDraftFactsService;
  access: ProductDraftFactsAccess;
}> {
  const prototypeAdministrator = isPrototypeAdministrator(
    context.userId,
    readPrototypeAdministratorUserIds(),
  );
  const sellerId = prototypeAdministrator
    ? null
    : await getCurrentSellerId({
        supabase: context.supabase as unknown as SellerLookupSupabase,
        userId: context.userId,
      });
  if (!prototypeAdministrator && !sellerId) {
    throw new ProductDraftFactsError(
      404,
      "product_draft_not_found",
      "The ProductDraft was not found.",
    );
  }
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");

  return {
    service: new ProductDraftFactsService(new SupabaseProductDraftFactsRepository(supabaseAdmin)),
    access: prototypeAdministrator
      ? { mode: "prototype_administrator" }
      : { mode: "seller", expectedSellerId: sellerId! },
  };
}
