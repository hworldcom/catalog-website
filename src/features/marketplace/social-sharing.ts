import type { MetaDescriptor } from "@tanstack/react-router";

import { formatPriceValue } from "@/components/product/product-price";
import { pick, t, type Lang } from "@/lib/i18n";

import type { PublicAudience } from "./public-audience";

export const BAZORIA_FALLBACK_SOCIAL_IMAGE_PATH = "/assets/social/bazoria-default.jpg";

export const bazoriaSocialDescription = t(
  "Discover wholesale products from real suppliers and contact sellers directly on Bazoria.",
  "Odkrywaj produkty hurtowe od prawdziwych dostawców i kontaktuj się ze sprzedawcami bezpośrednio na platformie Bazoria.",
  "Entdecken Sie Großhandelsprodukte von echten Lieferanten und kontaktieren Sie Anbieter direkt über Bazoria.",
  "Khám phá sản phẩm bán buôn từ các nhà cung cấp thực sự và liên hệ trực tiếp với người bán trên Bazoria.",
);

const richSocialCopy = {
  price: t("Price", "Cena", "Preis", "Giá"),
  supplier: t("Supplier", "Dostawca", "Lieferant", "Nhà cung cấp"),
  sellerFallback: t(
    "Browse this supplier's wholesale catalog and contact them directly on Bazoria.",
    "Przeglądaj katalog hurtowy tego dostawcy i skontaktuj się z nim bezpośrednio na platformie Bazoria.",
    "Entdecken Sie den Großhandelskatalog dieses Anbieters und kontaktieren Sie ihn direkt über Bazoria.",
    "Xem danh mục bán buôn của nhà cung cấp này và liên hệ trực tiếp với họ trên Bazoria.",
  ),
};

const SOCIAL_DESCRIPTION_MAX = 200;
const PRODUCT_DESCRIPTION_MAX = 100;
const SUPPLIER_NAME_MAX = 60;
const SELLER_ABOUT_MAX = 150;
const SELLER_LOCATION_MAX = 80;
const SEGMENT_SEPARATOR = " · ";

export type SocialPreview = {
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  url: string;
};

type SharedRouteInput = {
  origin: string;
  language: Lang;
  audience: PublicAudience;
};

export function buildProductSocialPreview({
  origin,
  productId,
  productTitle,
  productDescription,
  price,
  currency,
  supplierName,
  coverImageUrl,
  galleryImageUrls,
  language,
  audience,
}: SharedRouteInput & {
  productId: string;
  productTitle: string;
  productDescription: string | null;
  price: number | string | null;
  currency: string;
  supplierName: string;
  coverImageUrl: string | null;
  galleryImageUrls: Array<string>;
}): SocialPreview {
  return {
    title: `${productTitle} — Bazoria`,
    description: buildProductSocialDescription({
      productDescription,
      price,
      currency,
      supplierName,
      language,
    }),
    imageUrl: selectSocialImage(origin, [coverImageUrl, ...galleryImageUrls]),
    imageAlt: productTitle,
    url: buildSharedUrl(origin, `/p/${encodeURIComponent(productId)}`, language, audience),
  };
}

export function buildSellerSocialPreview({
  origin,
  canonicalSlug,
  sellerName,
  sellerAbout,
  sellerCity,
  sellerCountry,
  logoImageUrl,
  coverImageUrl,
  language,
  audience,
}: SharedRouteInput & {
  canonicalSlug: string;
  sellerName: string;
  sellerAbout: string | null;
  sellerCity: string | null;
  sellerCountry: string | null;
  logoImageUrl: string | null;
  coverImageUrl: string | null;
}): SocialPreview {
  return {
    title: `${sellerName} — Wholesale Storefront on Bazoria`,
    description: buildSellerSocialDescription({
      sellerAbout,
      sellerCity,
      sellerCountry,
      language,
    }),
    imageUrl: selectSocialImage(origin, [logoImageUrl, coverImageUrl]),
    imageAlt: sellerName,
    url: buildSharedUrl(origin, `/s/${encodeURIComponent(canonicalSlug)}`, language, audience),
  };
}

function buildProductSocialDescription({
  productDescription,
  price,
  currency,
  supplierName,
  language,
}: {
  productDescription: string | null;
  price: number | string | null;
  currency: string;
  supplierName: string;
  language: Lang;
}): string {
  const leading =
    normalizeSocialText(productDescription) || pick(bazoriaSocialDescription, language);
  const priceValue = formatPriceValue(price, currency);
  const normalizedSupplier = truncateSocialText(supplierName, SUPPLIER_NAME_MAX);
  const trailing = [
    priceValue ? `${pick(richSocialCopy.price, language)}: ${priceValue}` : null,
    normalizedSupplier ? `${pick(richSocialCopy.supplier, language)}: ${normalizedSupplier}` : null,
  ];

  return composeSocialDescription(leading, PRODUCT_DESCRIPTION_MAX, trailing);
}

function buildSellerSocialDescription({
  sellerAbout,
  sellerCity,
  sellerCountry,
  language,
}: {
  sellerAbout: string | null;
  sellerCity: string | null;
  sellerCountry: string | null;
  language: Lang;
}): string {
  const leading = normalizeSocialText(sellerAbout) || pick(richSocialCopy.sellerFallback, language);
  const city = normalizeSocialText(sellerCity);
  const country = normalizeSocialText(sellerCountry);
  const location = truncateSocialText(
    city && country && city !== country ? `${city}, ${country}` : city || country,
    SELLER_LOCATION_MAX,
  );

  return composeSocialDescription(leading, SELLER_ABOUT_MAX, [location || null]);
}

function composeSocialDescription(
  leading: string,
  leadingMax: number,
  trailingSegments: Array<string | null>,
): string {
  const trailing = trailingSegments.filter((segment): segment is string => Boolean(segment));
  const trailingText = trailing.join(SEGMENT_SEPARATOR);
  const reserved = trailingText
    ? codePointLength(trailingText) + codePointLength(SEGMENT_SEPARATOR)
    : 0;
  const availableLeading = Math.max(0, Math.min(leadingMax, SOCIAL_DESCRIPTION_MAX - reserved));
  const normalizedLeading = truncateSocialText(leading, availableLeading);

  return [normalizedLeading || null, ...trailing]
    .filter((segment): segment is string => Boolean(segment))
    .join(SEGMENT_SEPARATOR);
}

function truncateSocialText(value: string | null | undefined, maximum: number): string {
  const normalized = normalizeSocialText(value);
  if (!normalized || maximum <= 0) return "";

  const codePoints = Array.from(normalized);
  if (codePoints.length <= maximum) return normalized;
  if (maximum === 1) return "…";

  const contentMaximum = maximum - 1;
  let prefix = codePoints.slice(0, contentMaximum).join("");
  const nextCodePoint = codePoints[contentMaximum];
  if (nextCodePoint !== " " && !prefix.endsWith(" ")) {
    const lastSpace = prefix.lastIndexOf(" ");
    if (lastSpace > 0) prefix = prefix.slice(0, lastSpace);
  }

  prefix = prefix.trimEnd();
  if (!prefix) prefix = codePoints.slice(0, contentMaximum).join("");
  return `${prefix}…`;
}

function normalizeSocialText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/gu, " ") ?? "";
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function buildSocialMeta(preview: SocialPreview): Array<MetaDescriptor> {
  return [
    { title: preview.title },
    { name: "description", content: preview.description },
    { property: "og:title", content: preview.title },
    { property: "og:description", content: preview.description },
    { property: "og:image", content: preview.imageUrl },
    { property: "og:image:alt", content: preview.imageAlt },
    { property: "og:url", content: preview.url },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: preview.title },
    { name: "twitter:description", content: preview.description },
    { name: "twitter:image", content: preview.imageUrl },
  ];
}

export function isUsablePublicSocialImageUrl(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return false;

    const path = url.pathname.toLowerCase();
    if (path.includes("/object/sign/")) return false;

    const temporaryParameters = [
      "expires",
      "se",
      "sig",
      "signature",
      "token",
      "x-amz-signature",
      "x-goog-credential",
      "x-goog-expires",
      "x-goog-signature",
    ];
    const parameterNames = new Set(
      Array.from(url.searchParams.keys(), (parameter) => parameter.toLowerCase()),
    );
    return !temporaryParameters.some((parameter) => parameterNames.has(parameter));
  } catch {
    return false;
  }
}

function selectSocialImage(origin: string, candidates: Array<string | null>): string {
  for (const candidate of candidates) {
    const resolved = resolvePublicSocialImageUrl(origin, candidate);
    if (resolved) return resolved;
  }

  return new URL(BAZORIA_FALLBACK_SOCIAL_IMAGE_PATH, `${origin}/`).toString();
}

function resolvePublicSocialImageUrl(origin: string, value: string | null): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.startsWith("//")) return null;

  const resolved = candidate.startsWith("/")
    ? new URL(candidate, `${origin}/`).toString()
    : candidate;
  return isUsablePublicSocialImageUrl(resolved) ? resolved : null;
}

function buildSharedUrl(
  origin: string,
  path: string,
  language: Lang,
  audience: PublicAudience,
): string {
  const url = new URL(path, `${origin}/`);
  url.searchParams.set("lang", language);
  url.searchParams.set("audience", audience);
  return url.toString();
}
