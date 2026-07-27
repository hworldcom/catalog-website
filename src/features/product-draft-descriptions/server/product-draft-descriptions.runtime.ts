import type { SupabaseClient } from "@supabase/supabase-js";

import { assertPrototypeAdministrator } from "@/features/admin/server/prototype-administrator-access";
import type { Database } from "@/lib/supabase/types";

import { ProductDraftDescriptionService } from "../product-draft-descriptions.service";
import { SupabaseProductDraftDescriptionRepository } from "./supabase-product-draft-descriptions.repository";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export async function createProductDraftDescriptionRequestContext(
  context: AuthenticatedContext,
): Promise<{ service: ProductDraftDescriptionService }> {
  assertPrototypeAdministrator(context.userId);
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return {
    service: new ProductDraftDescriptionService(
      new SupabaseProductDraftDescriptionRepository(supabaseAdmin),
    ),
  };
}
