export const PRODUCT_CODE_PATTERN =
  /^[A-Z0-9]{3,10}-[A-Z0-9]{1,4}-[A-Z0-9]{2,4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

export class StoredProductCodeError extends Error {
  constructor() {
    super("The stored product code is invalid.");
    this.name = "StoredProductCodeError";
  }
}

export function parseStoredProductCode(value: unknown): string {
  if (typeof value !== "string" || !PRODUCT_CODE_PATTERN.test(value)) {
    throw new StoredProductCodeError();
  }
  return value;
}

export function parseStoredProductCodeOrNull(value: unknown): string | null {
  return value === null ? null : parseStoredProductCode(value);
}
