import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

export const listSellerBusinessCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient<
        import("@/lib/supabase/types").Database
      >;
    };

    const { data, error } = await supabase
      .from("categories")
      .select("id,slug,name,parent_id")
      .eq("slug", "fashion")
      .is("parent_id", null)
      .order("sort_order");
    if (error) throw new Error(error.message);

    return { categories: data ?? [] };
  });

export const listProductCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient<
        import("@/lib/supabase/types").Database
      >;
    };

    const fashion = await supabase
      .from("categories")
      .select("id")
      .eq("slug", "fashion")
      .is("parent_id", null)
      .maybeSingle();
    if (fashion.error) throw new Error(fashion.error.message);
    if (!fashion.data) throw new Error("fashion_category_missing");

    const { data, error } = await supabase
      .from("categories")
      .select("id,slug,name,parent_id")
      .eq("parent_id", fashion.data.id)
      .order("sort_order")
      .order("id");
    if (error) throw new Error(error.message);

    return { categories: data ?? [] };
  });
