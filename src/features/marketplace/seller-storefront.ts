import type { ProductCardProduct } from "@/components/product/product-card";

export type StorefrontProductCategory = {
  id: string;
  slug: string;
  name: string;
};

export type StorefrontProduct = ProductCardProduct & {
  category_id: string | null;
  category: StorefrontProductCategory | null;
};

export type StorefrontCategoryGroup = {
  category: StorefrontProductCategory;
  imageUrl: string | null;
  products: StorefrontProduct[];
};

export function groupStorefrontProducts(products: StorefrontProduct[]): StorefrontCategoryGroup[] {
  const groups = new Map<string, StorefrontCategoryGroup>();

  for (const product of products) {
    if (!product.category) continue;

    const existing = groups.get(product.category.id);
    if (existing) {
      existing.products.push(product);
      if (!existing.imageUrl && product.cover_image_url) {
        existing.imageUrl = product.cover_image_url;
      }
      continue;
    }

    groups.set(product.category.id, {
      category: product.category,
      imageUrl: product.cover_image_url,
      products: [product],
    });
  }

  return [...groups.values()].sort((a, b) =>
    a.category.name.localeCompare(b.category.name, undefined, { sensitivity: "base" }),
  );
}

export function filterStorefrontProducts(
  products: StorefrontProduct[],
  categoryId: string | null,
): StorefrontProduct[] {
  if (!categoryId) return products;
  return products.filter((product) => product.category?.id === categoryId);
}

export function getYearsInBusiness(
  establishedYear: number | null,
  currentYear = new Date().getFullYear(),
): number | null {
  if (
    !establishedYear ||
    !Number.isInteger(establishedYear) ||
    establishedYear > currentYear ||
    establishedYear < 1
  ) {
    return null;
  }

  return currentYear - establishedYear;
}

export function getSellerInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "B";
}

export function normalizeWhatsAppNumber(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

export function buildWhatsAppUrl(value: string | null, message?: string): string | null {
  const number = normalizeWhatsAppNumber(value);
  if (!number) return null;

  const url = `https://wa.me/${number}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}
