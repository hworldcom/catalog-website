import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ProductActivationError } from "@/features/admin/server/product-activation.types";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";

import { productModerationError } from "./product-moderation.types";

const productInputSchema = z.object({ productDraftId: z.string().uuid() }).strict();
const actionProductInputSchema = z.object({ productId: z.string().uuid() }).strict();
const submitInputSchema = actionProductInputSchema
  .extend({
    expectedModerationRevision: z.number().int().positive(),
    requestId: z.string().uuid(),
  })
  .strict();
const withdrawInputSchema = submitInputSchema.extend({ submissionId: z.string().uuid() }).strict();
const activationRecoveryInputSchema = actionProductInputSchema
  .extend({
    runId: z.string().uuid(),
    expectedDispatchGeneration: z.number().int().positive(),
    requestId: z.string().uuid(),
  })
  .strict();

export const getMyInitialProductModerationState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => productInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: SupabaseClient<Database>;
      userId: string;
    };
    const [{ supabaseAdmin }, { ProductModerationService }] = await Promise.all([
      import("@/lib/supabase/client.server"),
      import("./server/product-moderation.service"),
    ]);
    return new ProductModerationService(supabase as never, supabaseAdmin as never).read({
      userId,
      productDraftId: data.productDraftId,
    });
  });

export const beginMyProductEditing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => {
    const parsed = actionProductInputSchema.safeParse(input);
    if (!parsed.success) throw productModerationError("product_moderation_edit_invalid");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: SupabaseClient<Database>;
      userId: string;
    };
    const { createProductModerationSellerActionsService } =
      await import("./server/product-moderation-seller-actions.runtime");
    return (await createProductModerationSellerActionsService(supabase as never)).beginEditing({
      userId,
      productId: data.productId,
    });
  });

export const submitMyProductForModeration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseModerationWrite(input, submitInputSchema))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: SupabaseClient<Database>;
      userId: string;
    };
    const service = await actionService(supabase);
    const result = await service.submit({
      userId,
      productId: data.productId,
      expectedModerationRevision: data.expectedModerationRevision,
      requestId: data.requestId,
    });
    await applyPrivateResponseHeaders();
    return result;
  });

export const withdrawMyProductModerationSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => parseModerationWrite(input, withdrawInputSchema))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: SupabaseClient<Database>;
      userId: string;
    };
    const service = await actionService(supabase);
    const result = await service.withdraw({
      userId,
      productId: data.productId,
      submissionId: data.submissionId,
      expectedModerationRevision: data.expectedModerationRevision,
      requestId: data.requestId,
    });
    await applyPrivateResponseHeaders();
    return result;
  });

export const abandonMyFailedProductActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseActivationRecovery)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: SupabaseClient<Database>;
      userId: string;
    };
    const service = await actionService(supabase);
    const result = await service.abandonFailedActivation({ userId, ...data });
    await applyPrivateResponseHeaders();
    return result;
  });

export const retryMyProductAbandonmentCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseActivationRecovery)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: SupabaseClient<Database>;
      userId: string;
    };
    const service = await actionService(supabase);
    const result = await service.retryAbandonmentCleanup({ userId, ...data });
    await applyPrivateResponseHeaders();
    return result;
  });

function parseModerationWrite<T>(input: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw productModerationError("product_moderation_submission_invalid");
  return parsed.data;
}

function parseActivationRecovery(input: unknown) {
  const parsed = activationRecoveryInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProductActivationError(
      400,
      "product_activation_dispatch_invalid",
      "The activation recovery request is invalid.",
    );
  }
  return parsed.data;
}

async function actionService(supabase: SupabaseClient<Database>) {
  const { createProductModerationSellerActionsService } =
    await import("./server/product-moderation-seller-actions.runtime");
  return createProductModerationSellerActionsService(supabase as never);
}

async function applyPrivateResponseHeaders(): Promise<void> {
  const { applyPrivateProductDraftImageResponseHeaders } =
    await import("@/features/admin/server/product-draft-image-delivery.response");
  applyPrivateProductDraftImageResponseHeaders();
}
