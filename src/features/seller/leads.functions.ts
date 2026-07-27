import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

import { getCurrentSellerId } from "./server/current-seller.service";

export const listMyLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };

    const sellerId = await getCurrentSellerId({ supabase, userId });
    if (!sellerId) return { leads: [] };

    const { data, error } = await supabase
      .from("leads")
      .select(
        "id,created_at,buyer_name,buyer_email,buyer_phone,buyer_country,message,source,product_id,products(title)",
      )
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return { leads: data ?? [] };
  });
