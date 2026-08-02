import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

import { readSellerCompanyCodeError } from "./company-code";

const updateCompanyCodeSchema = z.object({
  companyCode: z.string().max(64),
});

export const updateMyCompanyCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => updateCompanyCodeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient<
        import("@/lib/supabase/types").Database
      >;
    };

    const response = await supabase.rpc("update_unlocked_seller_company_code", {
      p_submitted_company_code: data.companyCode,
    });
    if (response.error) throw companyCodeDatabaseError(response.error);

    const seller = response.data?.[0];
    if (!seller) throw new Error("seller_company_code_not_found");
    return { seller };
  });

export function companyCodeDatabaseError(error: { message: string }): Error {
  const code = readSellerCompanyCodeError(new Error(error.message));
  console.error("[Seller company code] Database operation failed.", {
    code: code ?? "unknown",
  });
  return new Error(code ?? "seller_company_code_unavailable");
}
