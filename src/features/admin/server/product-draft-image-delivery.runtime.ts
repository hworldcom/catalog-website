import { z } from "zod";

import {
  ProductDraftImageDeliveryEngine,
  ProductDraftImageDeliveryService,
} from "./product-draft-image-delivery.service";
import { SupabaseProductDraftImageDeliveryStorage } from "./product-draft-image-delivery.storage";
import {
  productDraftImageDeliveryUnavailable,
  type ConfirmedPrototypeAdministratorContext,
} from "./product-draft-image-delivery.types";
import { PrototypeAdministratorError } from "./prototype-administrator-access";
import { SupabaseProductDraftImageDeliveryRepository } from "./supabase-product-draft-image-delivery.repository";

const storageConfigurationSchema = z.object({
  SUPABASE_URL: z
    .string()
    .trim()
    .url()
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
});

export async function createProductDraftImageDeliveryService(
  authorization: ConfirmedPrototypeAdministratorContext,
): Promise<ProductDraftImageDeliveryService> {
  assertConfirmedAdministrator(authorization);

  return new ProductDraftImageDeliveryService(await createProductDraftImageDeliveryEngine());
}

export async function createProductDraftImageDeliveryEngine(): Promise<ProductDraftImageDeliveryEngine> {
  const configuration = readProductDraftImageDeliveryStorageConfiguration();
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");

  return new ProductDraftImageDeliveryEngine(
    new SupabaseProductDraftImageDeliveryRepository(supabaseAdmin),
    new SupabaseProductDraftImageDeliveryStorage(configuration),
  );
}

export function readProductDraftImageDeliveryStorageConfiguration(
  environment: Record<string, string | undefined> = process.env,
): {
  supabaseUrl: string;
  serviceRoleKey: string;
} {
  const parsed = storageConfigurationSchema.safeParse(environment);
  if (!parsed.success) throw productDraftImageDeliveryUnavailable();
  return {
    supabaseUrl: parsed.data.SUPABASE_URL.replace(/\/+$/, ""),
    serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function assertConfirmedAdministrator(authorization: ConfirmedPrototypeAdministratorContext): void {
  if (authorization.prototypeAdministrator !== true) {
    throw new PrototypeAdministratorError(
      403,
      "prototype_administrator_required",
      "Prototype administrator access is required.",
    );
  }
}
