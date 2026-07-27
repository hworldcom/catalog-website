import { t, tr } from "@/lib/i18n";

export type ProductStock = "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";

const S = {
  stockIn: t("In stock", "W magazynie", "Auf Lager", "Còn hàng"),
  stockLow: t("Low stock", "Mały zapas", "Wenig Bestand", "Sắp hết"),
  stockOut: t("Out of stock", "Brak w magazynie", "Nicht vorrätig", "Hết hàng"),
  stockMto: t("Made to order", "Na zamówienie", "Auf Bestellung", "Đặt hàng riêng"),
  askQuote: t("Ask for quote", "Zapytaj o wycenę", "Preis anfragen", "Yêu cầu báo giá"),
};

export function formatPrice(price: number | string | null, currency: string): string {
  const ask = tr(S.askQuote);
  if (price == null) return ask;
  const n = typeof price === "string" ? Number(price) : price;
  if (!Number.isFinite(n)) return ask;
  return `${currency} ${n.toFixed(2)}`;
}

export function getStockLabel(s: ProductStock): string {
  switch (s) {
    case "in_stock":
      return tr(S.stockIn);
    case "low_stock":
      return tr(S.stockLow);
    case "out_of_stock":
      return tr(S.stockOut);
    case "made_to_order":
      return tr(S.stockMto);
  }
}

export function getStockClass(s: ProductStock): string {
  switch (s) {
    case "in_stock":
      return "text-emerald-400";
    case "low_stock":
      return "text-amber-400";
    case "out_of_stock":
      return "text-rose-400";
    case "made_to_order":
      return "text-sky-400";
  }
}
