import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentSellerId,
  type SellerLookupSupabase,
} from "@/features/seller/server/current-seller.service";
import type { Database } from "@/lib/supabase/types";

import type { ProductDraftFactsAccess } from "../product-draft-facts.service";
import { ProductDraftFactsService } from "../product-draft-facts.service";
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
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");

  return {
    service: new ProductDraftFactsService(new SupabaseProductDraftFactsRepository(supabaseAdmin)),
    access: {
      sellerId,
      prototypeAdministrator,
    },
  };
}
