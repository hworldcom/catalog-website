import type { ReactNode } from "react";

import {
  PRODUCT_AUDIENCES,
  type ProductAudience,
} from "@/features/product-audience/product-audience.types";
import { PRODUCT_DRAFT_TITLE_MAX_LENGTH } from "@/features/product-draft-title/product-draft-title.types";
import { t, tr } from "@/lib/i18n";

export type ProductDraftFieldsValue = {
  audiences: ProductAudience[];
  title: string;
  categoryId: string;
  minimumOrderQuantity: string;
  packSize: string;
  price: string;
  currency: string;
  stock: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
  trending: boolean;
};

export type ProductDraftFieldsCategory = {
  id: string;
  name: string;
};

const S = {
  title: t("Title", "Tytuł", "Titel", "Tên"),
  source: t("Source", "Źródło", "Quelle", "Nguồn"),
  human: t("Human", "Człowiek", "Mensch", "Con người"),
  model: t("Model suggestion", "Sugestia modelu", "Modellvorschlag", "Đề xuất mô hình"),
  category: t("Category", "Kategoria", "Kategorie", "Danh mục"),
  audience: t("Audience", "Odbiorcy", "Zielgruppe", "Đối tượng"),
  audienceHelp: t(
    "Select every audience this product is intended for.",
    "Wybierz wszystkie grupy odbiorców, dla których przeznaczony jest produkt.",
    "Wählen Sie alle Zielgruppen aus, für die dieses Produkt bestimmt ist.",
    "Chọn tất cả đối tượng mà sản phẩm này hướng đến.",
  ),
  women: t("Women", "Kobiety", "Damen", "Nữ"),
  men: t("Men", "Mężczyźni", "Herren", "Nam"),
  kids: t("Kids", "Dzieci", "Kinder", "Trẻ em"),
  noCategory: t("No category", "Brak kategorii", "Keine Kategorie", "Không có danh mục"),
  stock: t("Stock", "Stan magazynowy", "Bestand", "Tồn kho"),
  inStock: t("In stock", "W magazynie", "Auf Lager", "Còn hàng"),
  lowStock: t("Low stock", "Niski stan", "Geringer Bestand", "Sắp hết hàng"),
  outOfStock: t("Out of stock", "Brak w magazynie", "Nicht auf Lager", "Hết hàng"),
  madeToOrder: t("Made to order", "Na zamówienie", "Auf Bestellung", "Làm theo đơn"),
  minimumOrderQuantity: t(
    "Minimum order quantity",
    "Minimalna ilość zamówienia",
    "Mindestbestellmenge",
    "Số lượng đặt hàng tối thiểu",
  ),
  packSize: t("Pack size", "Wielkość opakowania", "Packungsgröße", "Quy cách đóng gói"),
  packSizePlaceholder: t(
    "For example, 12 per box",
    "Na przykład 12 w pudełku",
    "Zum Beispiel 12 pro Karton",
    "Ví dụ: 12 sản phẩm mỗi hộp",
  ),
  price: t("Price (per unit)", "Cena (za sztukę)", "Preis (pro Einheit)", "Giá (mỗi đơn vị)"),
  currency: t("Currency", "Waluta", "Währung", "Tiền tệ"),
  trending: t(
    "Mark as trending (may feature on the marketplace home page)",
    "Oznacz jako popularny (może pojawić się na stronie głównej rynku)",
    "Als Trend markieren (kann auf der Marktplatz-Startseite erscheinen)",
    "Đánh dấu là xu hướng (có thể xuất hiện trên trang chủ chợ)",
  ),
};

export function ProductDraftFields({
  value,
  categories,
  titleSource,
  disabled = false,
  titleDisabled = disabled,
  audienceDisabled = disabled,
  onChange,
}: {
  value: ProductDraftFieldsValue;
  categories: ProductDraftFieldsCategory[];
  titleSource: "human" | "model" | null;
  disabled?: boolean;
  titleDisabled?: boolean;
  audienceDisabled?: boolean;
  onChange(value: ProductDraftFieldsValue): void;
}) {
  const audiences = value.audiences ?? [];
  const inputClassName =
    "border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70";

  function change(patch: Partial<ProductDraftFieldsValue>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label={tr(S.title)}>
          <input
            value={value.title}
            maxLength={PRODUCT_DRAFT_TITLE_MAX_LENGTH}
            onChange={(event) => change({ title: event.target.value })}
            className={inputClassName}
            disabled={titleDisabled}
          />
        </Field>
        {titleSource ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            {tr(S.source)}: {titleSource === "human" ? tr(S.human) : tr(S.model)}
          </span>
        ) : null}
      </div>

      <Field label={tr(S.category)}>
        <select
          value={value.categoryId}
          onChange={(event) => change({ categoryId: event.target.value })}
          className={inputClassName}
          disabled={disabled}
        >
          <option value="">{tr(S.noCategory)}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-2 md:col-span-2">
        <legend className="text-xs uppercase tracking-wide text-muted-foreground">
          {tr(S.audience)}
        </legend>
        <span className="text-xs text-muted-foreground">{tr(S.audienceHelp)}</span>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {PRODUCT_AUDIENCES.map((audience) => (
            <label key={audience} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={audiences.includes(audience)}
                onChange={(event) =>
                  change({
                    audiences: event.target.checked
                      ? PRODUCT_AUDIENCES.filter(
                          (candidate) => candidate === audience || audiences.includes(candidate),
                        )
                      : audiences.filter((candidate) => candidate !== audience),
                  })
                }
                disabled={audienceDisabled}
              />
              {tr(S[audience])}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label={tr(S.stock)}>
        <select
          value={value.stock}
          onChange={(event) =>
            change({ stock: event.target.value as ProductDraftFieldsValue["stock"] })
          }
          className={inputClassName}
          disabled={disabled}
        >
          <option value="in_stock">{tr(S.inStock)}</option>
          <option value="low_stock">{tr(S.lowStock)}</option>
          <option value="out_of_stock">{tr(S.outOfStock)}</option>
          <option value="made_to_order">{tr(S.madeToOrder)}</option>
        </select>
      </Field>

      <Field label={tr(S.minimumOrderQuantity)}>
        <input
          type="number"
          min={0}
          step={1}
          value={value.minimumOrderQuantity}
          onChange={(event) => change({ minimumOrderQuantity: event.target.value })}
          className={inputClassName}
          disabled={disabled}
        />
      </Field>

      <Field label={tr(S.packSize)}>
        <input
          value={value.packSize}
          onChange={(event) => change({ packSize: event.target.value })}
          className={inputClassName}
          disabled={disabled}
          maxLength={80}
          placeholder={tr(S.packSizePlaceholder)}
        />
      </Field>

      <Field label={tr(S.price)}>
        <input
          type="number"
          step="0.01"
          min={0}
          value={value.price}
          onChange={(event) => change({ price: event.target.value })}
          className={inputClassName}
          disabled={disabled}
        />
      </Field>

      <Field label={tr(S.currency)}>
        <input
          value={value.currency}
          onChange={(event) => change({ currency: event.target.value.toUpperCase() })}
          className={inputClassName}
          disabled={disabled}
          maxLength={6}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input
          type="checkbox"
          checked={value.trending}
          onChange={(event) => change({ trending: event.target.checked })}
          disabled={disabled}
        />
        {tr(S.trending)}
      </label>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
