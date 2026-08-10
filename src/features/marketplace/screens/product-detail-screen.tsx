import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { PublicShell } from "@/components/layout/public-shell";
import { formatPrice, getStockLabel } from "@/components/product/product-format";
import { productCodeCopy } from "@/features/product-code/product-code.copy";
import { pick, t, tr, type Lang } from "@/lib/i18n";

import { InquiryForm } from "../components/inquiry-form";
import type { PublicAudience } from "../public-audience";
import { getPublicCategoryLabel } from "../public-category-labels";
import { productQueryOptions } from "../queries";

const P = {
  marketplace: t("Marketplace", "Marketplace", "Marktplatz", "Marketplace"),
  moq: t("MOQ", "MOQ", "MBM", "SL tối thiểu"),
  packSize: t("Pack size", "Rozmiar opakowania", "Verpackungsgröße", "Kích cỡ gói"),
  supplier: t("Supplier", "Dostawca", "Lieferant", "Nhà cung cấp"),
  location: t("Location", "Lokalizacja", "Standort", "Vị trí"),
  description: t("Product description", "Opis produktu", "Produktbeschreibung", "Mô tả sản phẩm"),
  selectImage: t(
    "Select product image",
    "Wybierz zdjęcie produktu",
    "Produktbild auswählen",
    "Chọn hình ảnh sản phẩm",
  ),
  unavailableImage: t(
    "Image unavailable",
    "Zdjęcie niedostępne",
    "Bild nicht verfügbar",
    "Hình ảnh không khả dụng",
  ),
};

export function ProductDetailScreen({
  productId,
  language,
  audience,
}: {
  productId: string;
  language: Lang;
  audience: PublicAudience;
}) {
  const { data } = useSuspenseQuery(productQueryOptions(productId, language, audience));
  const { product, seller, images, category, description } = data;
  if (!product || !seller) return null;

  return (
    <PublicShell marketplaceAudience={audience}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <nav className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            {tr(P.marketplace)}
          </Link>
          {category ? (
            <>
              <span>/</span>
              <Link
                to="/c/$category"
                params={{ category: category.slug }}
                className="hover:text-foreground"
              >
                {getPublicCategoryLabel(category.slug, category.name, language)}
              </Link>
            </>
          ) : null}
          <span>/</span>
          <Link
            to="/s/$sellerSlug"
            params={{ sellerSlug: seller.slug }}
            className="hover:text-foreground"
          >
            {seller.name}
          </Link>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-3">
            <PublicProductImageGallery
              title={product.title}
              coverUrl={product.cover_image_url}
              images={images}
            />
          </div>

          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{product.title}</h1>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="font-display text-2xl font-semibold text-primary">
                {formatPrice(product.price, product.currency)}
              </span>
              <span className="text-xs text-muted-foreground">{getStockLabel(product.stock)}</span>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3 border-y border-border/60 py-4 text-sm">
              <Detail label={tr(productCodeCopy.label)} value={product.product_code} mono />
              {product.moq ? <Detail label={tr(P.moq)} value={String(product.moq)} /> : null}
              {product.pack_size ? (
                <Detail label={tr(P.packSize)} value={product.pack_size} />
              ) : null}
              <Detail
                label={tr(P.supplier)}
                value={
                  <Link
                    to="/s/$sellerSlug"
                    params={{ sellerSlug: seller.slug }}
                    className="underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    {seller.name}
                  </Link>
                }
              />
              <Detail
                label={tr(P.location)}
                value={[seller.city, seller.country].filter(Boolean).join(", ")}
              />
            </dl>

            {description ? (
              <section className="mt-6 border-t border-border/60 pt-5">
                <h2 className="font-display text-lg font-semibold">
                  {pick(P.description, language)}
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {description.text}
                </p>
              </section>
            ) : null}

            <InquiryForm
              productId={product.id}
              sellerId={seller.id}
              sellerName={seller.name}
              productTitle={product.title}
              whatsapp={seller.whatsapp}
              className="mt-6"
            />
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

function PublicProductImageGallery({
  title,
  coverUrl,
  images,
}: {
  title: string;
  coverUrl: string | null;
  images: Array<{ id: string; url: string }>;
}) {
  const gallery = useMemo(() => {
    const unique = new Map(images.map((image) => [image.id, image]));
    const ordered = [...unique.values()];
    if (coverUrl && !ordered.some((image) => image.url === coverUrl)) {
      ordered.unshift({ id: `cover:${coverUrl}`, url: coverUrl });
    }
    return ordered;
  }, [coverUrl, images]);
  const coverImage = gallery.find((image) => image.url === coverUrl) ?? gallery[0] ?? null;
  const [selectedImageId, setSelectedImageId] = useState<string | null>(coverImage?.id ?? null);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedImageId(coverImage?.id ?? null);
    setFailedImageIds(new Set());
  }, [coverImage?.id]);

  const selected =
    gallery.find((image) => image.id === selectedImageId && !failedImageIds.has(image.id)) ??
    gallery.find((image) => !failedImageIds.has(image.id)) ??
    null;

  function markFailed(imageId: string) {
    setFailedImageIds((current) => new Set(current).add(imageId));
    if (selectedImageId !== imageId) return;
    const fallback =
      gallery.find(
        (image) =>
          image.id === coverImage?.id && image.id !== imageId && !failedImageIds.has(image.id),
      ) ?? gallery.find((image) => image.id !== imageId && !failedImageIds.has(image.id));
    setSelectedImageId(fallback?.id ?? null);
  }

  return (
    <>
      <div className="aspect-square w-full overflow-hidden border border-border/60 bg-muted">
        {selected ? (
          <img
            key={selected.id}
            src={selected.url}
            alt={title}
            className="h-full w-full object-cover"
            onError={() => markFailed(selected.id)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {tr(P.unavailableImage)}
          </div>
        )}
      </div>
      {gallery.length > 1 ? (
        <div className="grid grid-cols-4 gap-2">
          {gallery.map((image, index) => {
            const failed = failedImageIds.has(image.id);
            const active = selected?.id === image.id;
            return (
              <button
                key={image.id}
                type="button"
                aria-label={`${tr(P.selectImage)} ${index + 1}`}
                aria-current={active ? "true" : undefined}
                disabled={failed}
                onClick={() => setSelectedImageId(image.id)}
                className={`aspect-square overflow-hidden border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  active ? "border-primary ring-1 ring-primary" : "border-border/60"
                }`}
              >
                {failed ? (
                  <span className="flex h-full items-center justify-center p-2 text-xs text-muted-foreground">
                    {tr(P.unavailableImage)}
                  </span>
                ) : (
                  <img
                    src={image.url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => markFailed(image.id)}
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 select-text text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
