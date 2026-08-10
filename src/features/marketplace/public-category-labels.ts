import { pick, t, type Lang, type T } from "@/lib/i18n";

const labels: Readonly<Record<string, T>> = {
  fashion: t("Clothing", "Odzież", "Bekleidung", "Quần áo"),
  "t-shirts": t("T-shirts", "T-shirty", "T-Shirts", "Áo thun"),
  hoodies: t("Hoodies", "Bluzy z kapturem", "Kapuzenpullover", "Áo hoodie"),
  trousers: t("Trousers", "Spodnie", "Hosen", "Quần dài"),
  jackets: t("Jackets", "Kurtki", "Jacken", "Áo khoác"),
  sportswear: t("Sportswear", "Odzież sportowa", "Sportbekleidung", "Đồ thể thao"),
  sweatshirts: t("Sweatshirts", "Bluzy", "Sweatshirts", "Áo nỉ"),
  sweaters: t("Sweaters", "Swetry", "Pullover", "Áo len"),
  cardigans: t("Cardigans", "Kardigany", "Strickjacken", "Áo cardigan"),
  jeans: t("Jeans", "Jeansy", "Jeans", "Quần jeans"),
  shorts: t("Shorts", "Szorty", "Shorts", "Quần short"),
  skirts: t("Skirts", "Spódnice", "Röcke", "Chân váy"),
  leggings: t("Leggings", "Legginsy", "Leggings", "Quần legging"),
  sweatpants: t("Sweatpants", "Spodnie dresowe", "Jogginghosen", "Quần nỉ"),
  dresses: t("Dresses", "Sukienki", "Kleider", "Váy liền"),
  blazers: t("Blazers", "Marynarki", "Blazer", "Áo blazer"),
  coats: t("Coats", "Płaszcze", "Mäntel", "Áo măng tô"),
  vests: t("Vests", "Kamizelki", "Westen", "Áo gile"),
  "tracksuit-sets": t("Tracksuit sets", "Komplety dresowe", "Trainingsanzüge", "Bộ đồ thể thao"),
};

export function getPublicCategoryLabel(slug: string, fallbackName: string, language: Lang): string {
  const label = labels[slug];
  return label ? pick(label, language) : fallbackName;
}
