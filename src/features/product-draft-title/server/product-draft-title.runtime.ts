import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentSellerId,
  type SellerLookupSupabase,
} from "@/features/seller/server/current-seller.service";
import type { Database } from "@/lib/supabase/types";

import type { ProductDraftTitleAccess } from "../product-draft-title.service";
import { ProductDraftTitleService } from "../product-draft-title.service";
import {
  isPrototypeAdministrator,
  readPrototypeAdministratorUserIds,
} from "@/features/admin/server/prototype-administrator-access";
import { SupabaseProductDraftTitleRepository } from "./supabase-product-draft-title.repository";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export async function createProductDraftTitleRequestContext(
  context: AuthenticatedContext,
): Promise<{
  service: ProductDraftTitleService;
  access: ProductDraftTitleAccess;
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

  return {
    service: await createProductDraftTitlePersistenceService(),
    access: {
      sellerId,
      prototypeAdministrator,
    },
  };
}

export async function createProductDraftTitlePersistenceService(): Promise<ProductDraftTitleService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new ProductDraftTitleService(new SupabaseProductDraftTitleRepository(supabaseAdmin));
}
