import type { Lang } from "@/lib/i18n";

export type PublicProductDescription = {
  text: string;
  resolvedLanguage: Lang;
};

const DATABASE_LANGUAGE_BY_INTERFACE_LANGUAGE: Record<Lang, "pl" | "en" | "de" | "vi"> = {
  PL: "pl",
  EN: "en",
  DE: "de",
  VI: "vi",
};

export function toDatabaseDescriptionLanguage(language: Lang): "pl" | "en" | "de" | "vi" {
  return DATABASE_LANGUAGE_BY_INTERFACE_LANGUAGE[language];
}

export function readPublicProductDescription(
  row: { description_text: string; resolved_language: string } | null,
): PublicProductDescription | null {
  if (!row) return null;

  return {
    text: row.description_text,
    resolvedLanguage: readInterfaceLanguage(row.resolved_language),
  };
}

function readInterfaceLanguage(value: string): Lang {
  switch (value) {
    case "pl":
      return "PL";
    case "en":
      return "EN";
    case "de":
      return "DE";
    case "vi":
      return "VI";
    default:
      throw new Error("The public product description returned an unsupported language.");
  }
}
