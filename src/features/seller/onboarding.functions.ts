import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

export const onboardSchema = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  primary_category_id: z.string().uuid().optional().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
});

export const onboardSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => onboardSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };

    const existing = await supabase
      .from("sellers")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    if (existing.data) return { seller: existing.data };

    const [{ ensureSellerRole }, { slugify }, { supabaseAdmin }] = await Promise.all([
      import("./server/seller-role.service"),
      import("./server/seller-slug"),
      import("@/lib/supabase/client.server"),
    ]);

    await ensureSellerRole({ userId });

    const base = slugify(data.name);
    let slug = base;
    let n = 1;
    while (true) {
      const { data: hit } = await supabaseAdmin
        .from("sellers")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!hit) break;
      n += 1;
      slug = `${base}-${n}`;
      if (n > 200) break;
    }

    const { data: created, error } = await supabaseAdmin
      .from("sellers")
      .insert({
        owner_id: userId,
        name: data.name,
        slug,
        city: data.city || null,
        country: data.country || null,
        primary_category_id: data.primary_category_id || null,
        whatsapp: data.whatsapp || null,
        published: false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return { seller: created };
  });
