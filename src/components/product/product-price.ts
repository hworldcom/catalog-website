export const MAX_PRODUCT_PRICE = 9_999_999_999.99;

const DECIMAL_PRICE_PATTERN = /^\d+(?:\.\d+)?$/u;
const CURRENCY_PATTERN = /^[A-Z]{3,6}$/u;

export function formatPriceValue(
  price: number | string | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (typeof currency !== "string" || !CURRENCY_PATTERN.test(currency)) return null;

  let amount: number;
  if (typeof price === "number") {
    amount = price;
  } else if (typeof price === "string" && DECIMAL_PRICE_PATTERN.test(price)) {
    amount = Number(price);
  } else {
    return null;
  }

  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_PRODUCT_PRICE) return null;
  return `${currency} ${amount.toFixed(2)}`;
}
