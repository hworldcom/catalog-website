import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

import { companyCodeDatabaseError } from "./company-code.functions";

export const onboardSchema = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  primary_category_id: z.string().uuid().optional().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  companyCode: z.string().max(64),
});

export const onboardSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => onboardSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as {
      userId: string;
    };

    const [{ slugify }, { supabaseAdmin }] = await Promise.all([
      import("./server/seller-slug"),
      import("@/lib/supabase/client.server"),
    ]);

    const response = await supabaseAdmin.rpc("create_seller_with_company_code", {
      p_owner_id: userId,
      p_name: data.name,
      p_slug_base: slugify(data.name),
      p_city: data.city || null,
      p_country: data.country || null,
      p_primary_category_id: data.primary_category_id || null,
      p_whatsapp: data.whatsapp || null,
      p_submitted_company_code: data.companyCode,
    });
    if (response.error) throw companyCodeDatabaseError(response.error);

    const seller = response.data?.[0];
    if (!seller) throw new Error("seller_onboarding_unavailable");
    return { seller };
  });
