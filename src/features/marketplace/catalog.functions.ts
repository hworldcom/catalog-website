import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseStoredProductCode } from "@/features/product-code/product-code";
import type { Database } from "@/lib/supabase/types";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type SellerRow = Database["public"]["Tables"]["sellers"]["Row"];
export type ProductRow = Database["public"]["Tables"]["products"]["Row"];

const HOME_EXCLUDED_CATEGORY_SLUGS = new Set([
  "textiles",
  "home-decor",
  "fashion",
  "beauty",
  "food",
  "electronics",
]);

export const listMarketplace = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [cats, trending, sellers] = await Promise.all([
    sb.from("categories").select("id,slug,name,tagline,sort_order").order("sort_order"),
    sb
      .from("products")
      .select("id,title,cover_image_url,price,currency,moq,pack_size,stock,seller_id")
      .eq("status", "published")
      .eq("trending", true)
      .limit(8),
    sb
      .from("sellers")
      .select("id,slug,name,city,country,verified,cover_image_url,primary_category_id")
      .eq("published", true)
      .limit(6),
  ]);
  if (cats.error) throw cats.error;
  if (trending.error) throw trending.error;
  if (sellers.error) throw sellers.error;
  return {
    categories: (cats.data ?? []).filter((category) => {
      return !HOME_EXCLUDED_CATEGORY_SLUGS.has(category.slug);
    }),
    trending: trending.data ?? [],
    sellers: sellers.data ?? [],
  };
});

export const getCategoryPage = createServerFn({ method: "GET" })
  .validator((input) => z.object({ slug: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: category, error: cErr } = await sb
      .from("categories")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!category) return { category: null, products: [], sellers: [] };
    const [products, sellers] = await Promise.all([
      sb
        .from("products")
        .select("id,title,cover_image_url,price,currency,moq,pack_size,stock,seller_id")
        .eq("status", "published")
        .eq("category_id", category.id)
        .limit(48),
      sb
        .from("sellers")
        .select("id,slug,name,city,country,verified,cover_image_url")
        .eq("published", true)
        .eq("primary_category_id", category.id)
        .limit(12),
    ]);
    if (products.error) throw products.error;
    if (sellers.error) throw sellers.error;
    return { category, products: products.data ?? [], sellers: sellers.data ?? [] };
  });

export const getSellerPage = createServerFn({ method: "GET" })
  .validator((input) => z.object({ slug: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: seller, error } = await sb
      .from("sellers")
      .select("*")
      .eq("slug", data.slug)
      .eq("published", true)
      .maybeSingle();
    if (error) throw error;
    if (!seller) return { seller: null, products: [] };
    const { data: products, error: pErr } = await sb
      .from("products")
      .select(
        "id,title,cover_image_url,price,currency,moq,pack_size,stock,category_id,category:categories(id,slug,name)",
      )
      .eq("seller_id", seller.id)
      .eq("status", "published")
      .order("created_at", { ascending: false });
    if (pErr) throw pErr;
    return { seller, products: products ?? [] };
  });

export const getProductPage = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: product, error } = await sb
      .from("products")
      .select("*")
      .eq("id", data.id)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    if (!product) return { product: null, seller: null, images: [], category: null };
    try {
      product.product_code = parseStoredProductCode(product.product_code);
    } catch (parseError) {
      console.error("[Public product detail] Stored product code is invalid.", {
        exceptionClass: parseError instanceof Error ? parseError.constructor.name : "UnknownError",
        productId: product.id,
      });
      throw new Error("The published product is temporarily unavailable.");
    }
    const [seller, images, category] = await Promise.all([
      sb
        .from("sellers")
        .select("id,slug,name,city,country,whatsapp,verified,cover_image_url,about")
        .eq("id", product.seller_id)
        .maybeSingle(),
      sb
        .from("product_images")
        .select("id,url,sort_order")
        .eq("product_id", product.id)
        .order("sort_order"),
      product.category_id
        ? sb.from("categories").select("id,slug,name").eq("id", product.category_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
    ]);
    return {
      product,
      seller: seller.data,
      images: images.data ?? [],
      category: category.data,
    };
  });

const leadSchema = z.object({
  productId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  buyerName: z.string().trim().min(1).max(120),
  buyerEmail: z.string().trim().email().max(255).optional().or(z.literal("")),
  buyerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  buyerCountry: z.string().trim().max(80).optional().or(z.literal("")),
  message: z.string().trim().min(1).max(2000),
  source: z.enum(["form", "whatsapp"]).default("form"),
});

export const submitLead = createServerFn({ method: "POST" })
  .validator((input) => leadSchema.parse(input))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { error } = await sb.from("leads").insert({
      product_id: data.productId ?? null,
      seller_id: data.sellerId ?? null,
      buyer_name: data.buyerName,
      buyer_email: data.buyerEmail || null,
      buyer_phone: data.buyerPhone || null,
      buyer_country: data.buyerCountry || null,
      message: data.message,
      source: data.source,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
