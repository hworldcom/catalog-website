import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Database } from "@/lib/supabase/types";
import {
  hasProductAudienceValidationIssue,
  productAudienceInvalid,
} from "@/features/product-audience/product-audience.types";

import {
  SellerProductPublicationError,
  type SellerProductPublicationSnapshot,
} from "./seller-product-publication.types";
import { sellerProductPublicationSchema } from "./seller-product-write.types";
import { getCurrentSellerId } from "./server/current-seller.service";
import type { SellerProductPublicationService } from "./server/seller-product-publication.service";

const productIdentifierSchema = z.object({ productDraftId: z.string().uuid() }).strict();

export const publishMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parsePublicationInput)
  .handler(async ({ data, context }) =>
    withPublicationService(context, data.id, (service, sellerId) =>
      service.publish(sellerId, data),
    ),
  );

export const getMyProductPublication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(parseProductIdentifier)
  .handler(async ({ data, context }) =>
    withPublicationService(context, data.productDraftId, (service, sellerId) =>
      service.get(data.productDraftId, sellerId),
    ),
  );

export const retryMyProductPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseProductIdentifier)
  .handler(async ({ data, context }) =>
    withPublicationService(context, data.productDraftId, (service, sellerId) =>
      service.retry(data.productDraftId, sellerId),
    ),
  );

function parsePublicationInput(input: unknown) {
  const parsed = sellerProductPublicationSchema.safeParse(input);
  if (!parsed.success && hasProductAudienceValidationIssue(parsed.error)) {
    throw productAudienceInvalid();
  }
  if (!parsed.success) throw invalidPublication();
  return parsed.data;
}

function parseProductIdentifier(input: unknown) {
  const parsed = productIdentifierSchema.safeParse(input);
  if (!parsed.success) throw invalidPublication();
  return parsed.data;
}

async function withPublicationService(
  context: unknown,
  productDraftId: string,
  operation: (
    service: SellerProductPublicationService,
    sellerId: string,
  ) => Promise<SellerProductPublicationSnapshot>,
): Promise<SellerProductPublicationSnapshot> {
  const { supabase, userId } = context as {
    supabase: SupabaseClient<Database>;
    userId: string;
  };
  const sellerId = await getCurrentSellerId({ supabase, userId });
  if (!sellerId) {
    throw new SellerProductPublicationError(404, "product_not_found", "The product was not found.");
  }
  const ownedProduct = await supabase
    .from("products")
    .select("id")
    .eq("id", productDraftId)
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (ownedProduct.error) throw new Error(ownedProduct.error.message);
  if (!ownedProduct.data) {
    throw new SellerProductPublicationError(404, "product_not_found", "The product was not found.");
  }

  try {
    const { createSellerProductPublicationService } =
      await import("./server/seller-product-publication.runtime");
    return await operation(await createSellerProductPublicationService(), sellerId);
  } catch (error) {
    if (error instanceof SellerProductPublicationError) throw error;
    if (
      error instanceof Error &&
      error.message.startsWith("product_publication_configuration_invalid:")
    ) {
      throw new SellerProductPublicationError(
        500,
        "product_publication_configuration_invalid",
        "Product publication is temporarily misconfigured.",
      );
    }
    console.error("[Seller product publication] Operation failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw new SellerProductPublicationError(
      503,
      "product_publication_unavailable",
      "Product publication is temporarily unavailable.",
    );
  }
}

function invalidPublication(): SellerProductPublicationError {
  return new SellerProductPublicationError(
    400,
    "product_publication_invalid",
    "The product publication request is invalid.",
  );
}
