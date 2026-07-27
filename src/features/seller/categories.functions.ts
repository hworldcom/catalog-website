import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

export const listCategoriesForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
    };

    const { data, error } = await supabase
      .from("categories")
      .select("id,slug,name")
      .order("sort_order");
    if (error) throw new Error(error.message);

    return { categories: data ?? [] };
  });
