import { Link } from "@tanstack/react-router";

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

export function ProductCard({ product }: { product: ProductCardProduct }) {
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
