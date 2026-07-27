import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { PublicShell } from "@/components/layout/public-shell";
import { formatPrice, getStockLabel } from "@/components/product/product-format";
import { t, tr } from "@/lib/i18n";

import { InquiryForm } from "../components/inquiry-form";
import { productQueryOptions } from "../queries";

const P = {
  marketplace: t("Marketplace", "Marketplace", "Marktplatz", "Marketplace"),
  moq: t("MOQ", "MOQ", "MBM", "SL tối thiểu"),
  packSize: t("Pack size", "Rozmiar opakowania", "Verpackungsgröße", "Kích cỡ gói"),
  supplier: t("Supplier", "Dostawca", "Lieferant", "Nhà cung cấp"),
  location: t("Location", "Lokalizacja", "Standort", "Vị trí"),
};

export function ProductDetailScreen({ productId }: { productId: string }) {
  const { data } = useSuspenseQuery(productQueryOptions(productId));
  const { product, seller, images, category } = data;
  if (!product || !seller) return null;

  const cover = product.cover_image_url ?? images[0]?.url ?? null;

  return (
    <PublicShell>
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
                {category.name}
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
            <div className="aspect-square w-full overflow-hidden border border-border/60 bg-muted">
              {cover ? (
                <img src={cover} alt={product.title} className="h-full w-full object-cover" />
              ) : null}
            </div>
            {images.length > 1 ? (
              <div className="grid grid-cols-4 gap-2">
                {images.slice(0, 8).map((img) => (
                  <div
                    key={img.id}
                    className="aspect-square overflow-hidden border border-border/60 bg-muted"
                  >
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}
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
              {product.moq ? <Detail label={tr(P.moq)} value={String(product.moq)} /> : null}
              {product.pack_size ? (
                <Detail label={tr(P.packSize)} value={product.pack_size} />
              ) : null}
              <Detail label={tr(P.supplier)} value={seller.name} />
              <Detail
                label={tr(P.location)}
                value={[seller.city, seller.country].filter(Boolean).join(", ")}
              />
            </dl>

            {product.description ? (
              <p className="mt-4 text-sm text-muted-foreground">{product.description}</p>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}
