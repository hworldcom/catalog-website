import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { PublicAudience } from "@/features/marketplace/public-audience";
import { hasImageLoadFailed } from "@/lib/image-failure";
import { t, tr } from "@/lib/i18n";

import { formatPrice, getStockClass, getStockLabel, type ProductStock } from "./product-format";

const S = {
  moq: t("MOQ", "MOQ", "MBM", "SL tối thiểu"),
};

export type ProductCardProduct = {
  id: string;
  title: string;
  cover_image_url: string | null;
  price: number | string | null;
  currency: string;
  moq: number | null;
  pack_size: string | null;
  stock: ProductStock;
};

export type EditorialProductCardProduct = ProductCardProduct & {
  seller_name: string;
  seller_slug: string;
};

type ProductCardProps =
  | {
      appearance?: "default";
      product: ProductCardProduct;
    }
  | {
      appearance: "editorial";
      audience: PublicAudience;
      product: EditorialProductCardProduct;
    };

export function ProductCard(props: ProductCardProps) {
  if (props.appearance === "editorial") {
    return <EditorialProductCard audience={props.audience} product={props.product} />;
  }

  return <DefaultProductCard product={props.product} />;
}

function DefaultProductCard({ product }: { product: ProductCardProduct }) {
  return (
    <Link
      to="/p/$productId"
      params={{ productId: product.id }}
      className="group flex flex-col overflow-hidden border border-border/60 bg-card/40 transition-colors hover:border-primary/70"
    >
      <div className="aspect-square w-full overflow-hidden bg-muted">
        {product.cover_image_url ? (
          <img
            src={product.cover_image_url}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-medium text-foreground">{product.title}</div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatPrice(product.price, product.currency)}</span>
          <span className={getStockClass(product.stock)}>{getStockLabel(product.stock)}</span>
        </div>
        {product.moq ? (
          <div className="text-[11px] text-muted-foreground">
            {tr(S.moq)} {product.moq}
            {product.pack_size ? ` · ${product.pack_size}` : ""}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function EditorialProductCard({
  audience,
  product,
}: {
  audience: PublicAudience;
  product: EditorialProductCardProduct;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const packSize = product.pack_size?.trim() || null;
  const orderDetails = [product.moq !== null ? `${tr(S.moq)} ${product.moq}` : null, packSize]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  const preserveMarketplaceSearch = (previous: Record<string, unknown>) => ({
    ...previous,
    audience,
  });

  return (
    <article className="flex min-w-0 flex-col" data-appearance="editorial">
      <Link
        to="/p/$productId"
        params={{ productId: product.id }}
        search={preserveMarketplaceSearch}
        aria-label={product.title}
        className="group/product rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div
          className="aspect-[4/5] w-full overflow-hidden rounded-md bg-muted"
          data-testid="editorial-product-image"
        >
          {product.cover_image_url && !imageFailed ? (
            <img
              src={product.cover_image_url}
              alt={product.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover/product:scale-[1.025]"
              ref={(image) => {
                if (hasImageLoadFailed(image)) setImageFailed(true);
              }}
              onError={() => setImageFailed(true)}
            />
          ) : null}
        </div>
        <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground">
          {product.title}
        </h3>
      </Link>

      <Link
        to="/s/$sellerSlug"
        params={{ sellerSlug: product.seller_slug }}
        search={preserveMarketplaceSearch}
        className="mt-1 block truncate text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {product.seller_name}
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs">
        <span className="font-semibold text-foreground">
          {formatPrice(product.price, product.currency)}
        </span>
        <span className="text-muted-foreground">{getStockLabel(product.stock)}</span>
      </div>
      {orderDetails ? (
        <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{orderDetails}</div>
      ) : null}
    </article>
  );
}
