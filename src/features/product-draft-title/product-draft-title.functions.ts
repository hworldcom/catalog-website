import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import {
  parseGetProductDraftTitleInput,
  parseUpdateProductDraftTitleInput,
} from "./product-draft-title.types";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export const getProductDraftTitle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(parseGetProductDraftTitleInput)
  .handler(async ({ data, context }) => {
    const { createProductDraftTitleRequestContext } =
      await import("./server/product-draft-title.runtime");
    const runtime = await createProductDraftTitleRequestContext(context as AuthenticatedContext);
    return runtime.service.get(data.productDraftId, runtime.access);
  });

export const updateProductDraftTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseUpdateProductDraftTitleInput)
  .handler(async ({ data, context }) => {
    const { createProductDraftTitleRequestContext } =
      await import("./server/product-draft-title.runtime");
    const runtime = await createProductDraftTitleRequestContext(context as AuthenticatedContext);
    return runtime.service.update(data.productDraftId, data.title, runtime.access);
  });
