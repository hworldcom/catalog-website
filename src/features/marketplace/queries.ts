import { queryOptions } from "@tanstack/react-query";

import {
  getCategoryPage,
  getProductPage,
  getSellerPage,
  listMarketplace,
} from "./catalog.functions";

export const marketplaceQueryOptions = () =>
  queryOptions({
    queryKey: ["marketplace", "home"],
    queryFn: () => listMarketplace(),
  });

export const categoryQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["category", slug],
    queryFn: () => getCategoryPage({ data: { slug } }),
  });

export const sellerQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["seller", slug],
    queryFn: () => getSellerPage({ data: { slug } }),
  });

export const productQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["product", id],
    queryFn: () => getProductPage({ data: { id } }),
  });
