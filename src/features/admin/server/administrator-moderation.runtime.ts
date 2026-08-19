import type { ConfirmedPrototypeAdministratorContext } from "./product-draft-image-delivery.types";
import { createProductDraftImageDeliveryService } from "./product-draft-image-delivery.runtime";
import { AdministratorModerationActionsService } from "./administrator-moderation-actions.service";
import { AdministratorModerationService } from "./administrator-moderation.service";
import { SupabaseProductActivationRepository } from "./product-activation.repository";
import { SupabaseAdministratorModerationRepository } from "./supabase-administrator-moderation.repository";

export async function createAdministratorModerationService(
  authorization: ConfirmedPrototypeAdministratorContext,
): Promise<AdministratorModerationService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const imageDelivery = await createProductDraftImageDeliveryService(authorization);
  return new AdministratorModerationService(
    new SupabaseAdministratorModerationRepository(supabaseAdmin as never),
    imageDelivery,
  );
}

export async function createAdministratorModerationActionsService(
  authorization: ConfirmedPrototypeAdministratorContext,
): Promise<AdministratorModerationActionsService> {
  const [{ supabaseAdmin }, { decideSellerProfileSubmission }, details] = await Promise.all([
    import("@/lib/supabase/client.server"),
    import("@/features/seller/server/seller-profile-moderation.service"),
    createAdministratorModerationService(authorization),
  ]);
  const repository = new SupabaseProductActivationRepository(supabaseAdmin as never);

  return new AdministratorModerationActionsService(
    details,
    (input) =>
      decideSellerProfileSubmission({
        ...input,
        administrator: supabaseAdmin as never,
      }),
    {
      repository,
      dispatcher: {
        async dispatch(payload) {
          const { getProductActivationRuntime } = await import("./product-activation.runtime");
          return (await getProductActivationRuntime()).dispatcher.dispatch(payload);
        },
      },
    },
  );
}
