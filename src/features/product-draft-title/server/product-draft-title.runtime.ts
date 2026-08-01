import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentSellerId,
  type SellerLookupSupabase,
} from "@/features/seller/server/current-seller.service";
import type { Database } from "@/lib/supabase/types";

import type { ProductDraftTitleAccess } from "../product-draft-title.service";
import { ProductDraftTitleService } from "../product-draft-title.service";
import { ProductDraftTitleError } from "../product-draft-title.types";
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
  if (!prototypeAdministrator && !sellerId) {
    throw new ProductDraftTitleError(
      404,
      "product_draft_not_found",
      "The ProductDraft was not found.",
    );
  }

  return {
    service: await createProductDraftTitlePersistenceService(),
    access: prototypeAdministrator
      ? { mode: "prototype_administrator" }
      : { mode: "seller", expectedSellerId: sellerId! },
  };
}

export async function createProductDraftTitlePersistenceService(): Promise<ProductDraftTitleService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new ProductDraftTitleService(new SupabaseProductDraftTitleRepository(supabaseAdmin));
}
