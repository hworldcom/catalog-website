import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import {
  parseGetProductDraftFactsInput,
  parseUpdateProductDraftFactsInput,
} from "./product-draft-facts.types";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export const getProductDraftFacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(parseGetProductDraftFactsInput)
  .handler(async ({ data, context }) => {
    const { createProductDraftFactsRequestContext } =
      await import("./server/product-draft-facts.runtime");
    const runtime = await createProductDraftFactsRequestContext(context as AuthenticatedContext);
    return runtime.service.get(data.productDraftId, runtime.access);
  });

export const updateProductDraftFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseUpdateProductDraftFactsInput)
  .handler(async ({ data, context }) => {
    const { createProductDraftFactsRequestContext } =
      await import("./server/product-draft-facts.runtime");
    const runtime = await createProductDraftFactsRequestContext(context as AuthenticatedContext);
    return runtime.service.update(
      data.productDraftId,
      data.patch,
      data.expectedModerationRevision,
      runtime.access,
    );
  });
