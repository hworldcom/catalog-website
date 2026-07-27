import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

export const setStorefrontPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ published: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };

    const { error } = await supabase
      .from("sellers")
      .update({ published: data.published })
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

const storefrontSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "lowercase, digits, dashes only"),
  city: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal("")),
  about: z.string().trim().max(4000).nullable().optional(),
  logo_url: z.string().trim().url().max(1000).nullable().optional().or(z.literal("")),
  cover_image_url: z.string().trim().url().max(1000).nullable().optional().or(z.literal("")),
  established_year: z.number().int().min(1800).max(2100).nullable().optional(),
  primary_category_id: z.string().uuid().nullable().optional(),
  published: z.boolean(),
});

export const updateStorefront = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => storefrontSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };

    const { error } = await supabase
      .from("sellers")
      .update({
        name: data.name,
        slug: data.slug,
        city: data.city || null,
        country: data.country || null,
        whatsapp: data.whatsapp || null,
        email: data.email || null,
        about: data.about || null,
        logo_url: data.logo_url || null,
        cover_image_url: data.cover_image_url || null,
        established_year: data.established_year ?? null,
        primary_category_id: data.primary_category_id || null,
        published: data.published,
      })
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
