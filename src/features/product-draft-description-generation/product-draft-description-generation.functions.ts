import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import { parseGenerateMyProductDraftDescriptionsInput } from "./product-draft-description-generation.types";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export const generateMyProductDraftDescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseGenerateMyProductDraftDescriptionsInput)
  .handler(async ({ data, context }) => {
    const { generateProductDraftDescriptionsForCurrentSeller } =
      await import("./server/product-draft-description-generation.runtime");
    return generateProductDraftDescriptionsForCurrentSeller(
      context as AuthenticatedContext,
      data.productDraftId,
    );
  });
