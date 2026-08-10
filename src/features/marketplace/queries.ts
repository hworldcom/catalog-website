import { queryOptions } from "@tanstack/react-query";
import type { Lang } from "@/lib/i18n";
import type { PublicAudience } from "./public-audience";

import {
  getAudienceNavigation,
  getCategoryPage,
  getProductPage,
  getSellerPage,
  listMarketplace,
} from "./catalog.functions";

export const marketplaceQueryOptions = (audience: PublicAudience) =>
  queryOptions({
    queryKey: ["marketplace", "home", audience],
    queryFn: () => listMarketplace({ data: { audience } }),
  });

export const audienceNavigationQueryOptions = (audience: PublicAudience) =>
  queryOptions({
    queryKey: ["marketplace", "navigation", audience],
    queryFn: () => getAudienceNavigation({ data: { audience } }),
  });

export const categoryQueryOptions = (slug: string, audience: PublicAudience) =>
  queryOptions({
    queryKey: ["category", slug, audience],
    queryFn: () => getCategoryPage({ data: { slug, audience } }),
  });

export const sellerQueryOptions = (slug: string, audience: PublicAudience) =>
  queryOptions({
    queryKey: ["seller", slug, audience],
    queryFn: () => getSellerPage({ data: { slug, audience } }),
  });

export const productQueryOptions = (id: string, language: Lang, audience: PublicAudience) =>
  queryOptions({
    queryKey: ["product", id, language, audience],
    queryFn: () => getProductPage({ data: { id, language, audience } }),
  });
