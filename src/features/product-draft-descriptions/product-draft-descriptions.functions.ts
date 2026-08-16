import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import {
  parseGetProductDraftDescriptionsInput,
  parseUpdateProductDraftDescriptionsInput,
  normalizeProductDraftDescriptionPatch,
} from "./product-draft-descriptions.types";

type AuthenticatedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export const getProductDraftDescriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(parseGetProductDraftDescriptionsInput)
  .handler(async ({ data, context }) => {
    const { createProductDraftDescriptionRequestContext } =
      await import("./server/product-draft-descriptions.runtime");
    const runtime = await createProductDraftDescriptionRequestContext(
      context as AuthenticatedContext,
    );
    return runtime.service.get(data.productDraftId, runtime.access);
  });

export const updateProductDraftDescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseUpdateProductDraftDescriptionsInput)
  .handler(async ({ data, context }) => {
    const { createProductDraftDescriptionRequestContext } =
      await import("./server/product-draft-descriptions.runtime");
    const runtime = await createProductDraftDescriptionRequestContext(
      context as AuthenticatedContext,
    );
    return runtime.service.update(
      data.productDraftId,
      normalizeProductDraftDescriptionPatch(data.descriptions),
      data.expectedModerationRevision,
      runtime.access,
    );
  });

export const getMyProductDraftDescriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(parseGetProductDraftDescriptionsInput)
  .handler(async ({ data, context }) => {
    const { createSellerProductDraftDescriptionRequestContext } =
      await import("./server/product-draft-descriptions.runtime");
    const runtime = await createSellerProductDraftDescriptionRequestContext(
      context as AuthenticatedContext,
    );
    return runtime.service.get(data.productDraftId, runtime.access);
  });

export const updateMyProductDraftDescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseUpdateProductDraftDescriptionsInput)
  .handler(async ({ data, context }) => {
    const { createSellerProductDraftDescriptionRequestContext } =
      await import("./server/product-draft-descriptions.runtime");
    const runtime = await createSellerProductDraftDescriptionRequestContext(
      context as AuthenticatedContext,
    );
    return runtime.service.update(
      data.productDraftId,
      normalizeProductDraftDescriptionPatch(data.descriptions),
      data.expectedModerationRevision,
      runtime.access,
    );
  });
