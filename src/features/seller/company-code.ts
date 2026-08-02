export const COMPANY_CODE_PATTERN = /^[A-Z0-9]{3}[0-9]*$/;

export type SellerCompanyCodeErrorCode =
  | "seller_company_code_invalid"
  | "seller_company_code_taken"
  | "seller_company_code_exhausted"
  | "seller_company_code_locked"
  | "seller_company_code_not_found"
  | "seller_slug_allocation_failed"
  | "seller_onboarding_invalid"
  | "seller_business_category_not_supported";

const errorCodes: readonly SellerCompanyCodeErrorCode[] = [
  "seller_company_code_invalid",
  "seller_company_code_taken",
  "seller_company_code_exhausted",
  "seller_company_code_locked",
  "seller_company_code_not_found",
  "seller_slug_allocation_failed",
  "seller_onboarding_invalid",
  "seller_business_category_not_supported",
];

export function deriveCompanyCodePreview(companyName: string): string {
  const normalizedName = companyName
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (normalizedName.length < 3) return "";

  const middleIndex = Math.floor((normalizedName.length - 1) / 2);
  return `${normalizedName[0]}${normalizedName[middleIndex]}${normalizedName.at(-1)}`;
}

export function normalizeSubmittedCompanyCode(value: string): string {
  return value.trim().toUpperCase();
}

export function readSellerCompanyCodeError(error: unknown): SellerCompanyCodeErrorCode | null {
  const message = error instanceof Error ? error.message : String(error);
  return errorCodes.find((code) => message.includes(code)) ?? null;
}
