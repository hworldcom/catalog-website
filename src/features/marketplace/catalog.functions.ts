import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseStoredProductCode } from "@/features/product-code/product-code";
import type { Database } from "@/lib/supabase/types";

import {
  readPublicProductDescription,
  toDatabaseDescriptionLanguage,
} from "./public-product-description";
import { publicAudienceSchema, type PublicAudience } from "./public-audience";
import { resolvePublicSiteOrigin } from "./public-site-origin";

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
export type PublicTrendingProduct =
  Database["public"]["Functions"]["list_public_trending_products"]["Returns"][number];
type PublicFeaturedSellerRow =
  Database["public"]["Functions"]["list_public_featured_sellers"]["Returns"][number];
export type PublicFeaturedSeller = Omit<
  PublicFeaturedSellerRow,
  | "city"
  | "country"
  | "cover_image_url"
  | "logo_url"
  | "primary_category_id"
  | "primary_category_name"
  | "primary_category_slug"
> & {
  city: string | null;
  country: string | null;
  cover_image_url: string | null;
  logo_url: string | null;
  primary_category_id: string | null;
  primary_category_name: string | null;
  primary_category_slug: string | null;
};

export type PublicClothingCategory = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
};

export type PublicAudienceSeller = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
};

export const getAudienceNavigation = createServerFn({ method: "GET" })
  .validator((input) => z.object({ audience: publicAudienceSchema }).parse(input))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const [categories, sellers] = await Promise.all([
      sb.rpc("list_public_clothing_categories", {
        p_audience: data.audience,
        p_limit: 50,
      }),
      sb.rpc("list_public_audience_sellers", {
        p_audience: data.audience,
        p_limit: 100,
      }),
    ]);
    if (categories.error) throw categories.error;
    if (sellers.error) throw sellers.error;
    return {
      audience: data.audience,
      categories: (categories.data ?? []).map((category): PublicClothingCategory => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        sortOrder: category.sort_order,
      })),
      sellers: (sellers.data ?? []).map((seller): PublicAudienceSeller => ({
        id: seller.id,
        slug: seller.slug,
        name: seller.name,
        logoUrl: seller.logo_url,
      })),
    };
  });

type ListMarketplaceDependencies = {
  createPublicClient: typeof publicClient;
};

const listMarketplaceDependencies: ListMarketplaceDependencies = {
  createPublicClient: publicClient,
};

export async function handleListMarketplace(
  data: { audience: PublicAudience },
  dependencies: ListMarketplaceDependencies = listMarketplaceDependencies,
) {
  const sb = dependencies.createPublicClient();
  const [trending, sellers] = await Promise.all([
    sb.rpc("list_public_trending_products", {
      p_audience: data.audience,
      p_limit: 8,
    }),
    sb.rpc("list_public_featured_sellers", {
      p_audience: data.audience,
      p_limit: 6,
    }),
  ]);
  if (trending.error) throw trending.error;
  if (sellers.error) throw sellers.error;

  const trendingProducts: PublicTrendingProduct[] = trending.data ?? [];
  const featuredSellers: PublicFeaturedSeller[] = sellers.data ?? [];
  return {
    trending: trendingProducts,
    sellers: featuredSellers,
  };
}

export const listMarketplace = createServerFn({ method: "GET" })
  .validator((input) => z.object({ audience: publicAudienceSchema }).parse(input))
  .handler(({ data }) => handleListMarketplace(data));

export const getCategoryPage = createServerFn({ method: "GET" })
  .validator((input) =>
    z.object({ slug: z.string().min(1).max(80), audience: publicAudienceSchema }).parse(input),
  )
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
      sb.rpc("list_public_category_products", {
        p_category_slug: category.slug,
        p_audience: data.audience,
        p_limit: 48,
      }),
      sb.rpc("list_public_category_sellers", {
        p_category_slug: category.slug,
        p_audience: data.audience,
        p_limit: 12,
      }),
    ]);
    if (products.error) throw products.error;
    if (sellers.error) throw sellers.error;
    return { category, products: products.data ?? [], sellers: sellers.data ?? [] };
  });

export const getSellerPage = createServerFn({ method: "GET" })
  .validator((input) =>
    z.object({ slug: z.string().min(1).max(80), audience: publicAudienceSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const publicSiteOrigin = resolvePublicSiteOrigin(process.env);
    const sb = publicClient();
    const resolution = await sb.rpc("resolve_public_seller_slug", { p_slug: data.slug });
    if (resolution.error) throw resolution.error;
    const resolved = resolution.data?.[0];
    if (!resolved) return { seller: null, products: [], canonicalSlug: null, publicSiteOrigin };

    const { data: seller, error } = await sb
      .from("sellers")
      .select("*")
      .eq("id", resolved.seller_id)
      .eq("published", true)
      .maybeSingle();
    if (error) throw error;
    if (!seller) return { seller: null, products: [], canonicalSlug: null, publicSiteOrigin };
    const { data: products, error: pErr } = await sb.rpc("list_public_seller_products", {
      p_seller_slug: seller.slug,
      p_audience: data.audience,
      p_limit: 100,
    });
    if (pErr) throw pErr;
    return {
      seller,
      canonicalSlug: resolved.canonical_slug,
      publicSiteOrigin,
      products: (products ?? []).map((product) => ({
        id: product.id,
        title: product.title,
        cover_image_url: product.cover_image_url,
        price: product.price,
        currency: product.currency,
        moq: product.moq,
        pack_size: product.pack_size,
        stock: product.stock,
        category_id: product.category_id,
        category:
          product.category_id && product.category_slug && product.category_name
            ? {
                id: product.category_id,
                slug: product.category_slug,
                name: product.category_name,
              }
            : null,
      })),
    };
  });

export const getProductPage = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        id: z.string().uuid(),
        language: z.enum(["EN", "PL", "DE", "VI"]),
        audience: publicAudienceSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const publicSiteOrigin = resolvePublicSiteOrigin(process.env);
    const sb = publicClient();
    const { data: product, error } = await sb
      .from("products")
      .select("*")
      .eq("id", data.id)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    if (!product) {
      return {
        product: null,
        seller: null,
        images: [],
        category: null,
        description: null,
        publicSiteOrigin,
      };
    }
    const seller = await sb
      .from("sellers")
      .select("id,slug,name,city,country,whatsapp,verified,cover_image_url,about")
      .eq("id", product.seller_id)
      .eq("published", true)
      .maybeSingle();
    if (seller.error) throw seller.error;
    if (!seller.data) {
      return {
        product: null,
        seller: null,
        images: [],
        category: null,
        description: null,
        publicSiteOrigin,
      };
    }
    try {
      product.product_code = parseStoredProductCode(product.product_code);
    } catch (parseError) {
      console.error("[Public product detail] Stored product code is invalid.", {
        exceptionClass: parseError instanceof Error ? parseError.constructor.name : "UnknownError",
        productId: product.id,
      });
      throw new Error("The published product is temporarily unavailable.");
    }
    const [images, category, description] = await Promise.all([
      sb
        .from("product_images")
        .select("id,url,sort_order")
        .eq("product_id", product.id)
        .order("sort_order"),
      product.category_id
        ? sb.from("categories").select("id,slug,name").eq("id", product.category_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
      sb
        .rpc("get_public_product_description", {
          p_product_id: product.id,
          p_language: toDatabaseDescriptionLanguage(data.language),
        })
        .maybeSingle(),
    ]);
    if (images.error) throw images.error;
    if (category.error) throw category.error;
    if (description.error) throw description.error;
    return {
      product,
      seller: seller.data,
      images: images.data ?? [],
      category: category.data,
      description: readPublicProductDescription(description.data),
      publicSiteOrigin,
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
