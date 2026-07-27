import { createFileRoute, Link } from "@tanstack/react-router";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";

export const Route = createFileRoute("/demo/marketplace")({
  component: MarketplacePage,
  head: () => ({
    meta: [
      { title: "Bazoria — Wholesale Discovery Platform for Retailers & Resellers" },
      {
        name: "description",
        content:
          "Find wholesale products from real suppliers. Browse digital catalogs, discover available stock, and contact sellers directly through inquiry forms or WhatsApp.",
      },
    ],
  }),
});

// ---------------- i18n ----------------

const languages = ["EN", "PL", "DE", "VI"] as const;
type Lang = (typeof languages)[number];

type T = Partial<Record<Lang, string>> & { EN: string };
const t = (en: string, pl: string, de: string, vi: string): T => ({
  EN: en,
  PL: pl,
  DE: de,
  VI: vi,
});

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; isPending: boolean }>({
  lang: "EN",
  setLang: () => {},
  isPending: false,
});

function useLang() {
  return useContext(LangContext).lang;
}

// Safely pick a translation, falling back to English (then any available value)
// so a missing/empty entry never breaks the UI.
function pick(dict: T | undefined | null, lang: Lang): string {
  if (!dict) return "";
  const val = dict[lang];
  if (val != null && val !== "") return val;
  if (dict.EN) return dict.EN;
  for (const l of languages) {
    const v = dict[l];
    if (v) return v;
  }
  return "";
}

function translate(dict: T, lang: Lang) {
  return pick(dict, lang);
}

// ---------------- UI strings ----------------

const ui = {
  nav: {
    products: t("Products", "Produkty", "Produkte", "Sản phẩm"),
    suppliers: t("Suppliers", "Dostawcy", "Lieferanten", "Nhà cung cấp"),
    trending: t("Trending", "Popularne", "Trends", "Xu hướng"),
    how: t("How it works", "Jak to działa", "So funktioniert's", "Cách hoạt động"),
    signIn: t("Sign in", "Zaloguj się", "Anmelden", "Đăng nhập"),
    listCatalog: t("List your catalog", "Dodaj katalog", "Katalog einstellen", "Đăng ký danh mục"),
  },
  hero: {
    kicker: t(
      "B2B Wholesale Discovery",
      "B2B Odkrywanie hurtu",
      "B2B Großhandel entdecken",
      "Khám phá bán buôn B2B",
    ),
    titleA: t(
      "Find wholesale products",
      "Znajdź produkty hurtowe",
      "Großhandelsprodukte finden",
      "Tìm sản phẩm bán buôn",
    ),
    titleB: t(
      "from real suppliers.",
      "od prawdziwych dostawców.",
      "von echten Lieferanten.",
      "từ nhà cung cấp thật.",
    ),
    lead: t(
      "Bazoria is where retailers, online sellers and market vendors discover wholesale catalogs — browse products, open a supplier's storefront, and inquire directly. No checkout, no middlemen.",
      "Bazoria to miejsce, gdzie sklepy, sprzedawcy online i handlarze bazarowi odkrywają katalogi hurtowe — przeglądaj produkty, wejdź do sklepu dostawcy i zapytaj bezpośrednio. Bez koszyka, bez pośredników.",
      "Bazoria ist der Ort, an dem Händler, Online-Verkäufer und Marktverkäufer Großhandelskataloge entdecken — Produkte durchsuchen, den Shop eines Lieferanten öffnen und direkt anfragen. Kein Checkout, keine Mittelsmänner.",
      "Bazoria là nơi nhà bán lẻ, người bán online và tiểu thương chợ khám phá danh mục bán buôn — duyệt sản phẩm, mở gian hàng nhà cung cấp và hỏi trực tiếp. Không thanh toán, không trung gian.",
    ),
    searchPlaceholder: t(
      "Search products, categories or suppliers…",
      "Szukaj produktów, kategorii lub dostawców…",
      "Produkte, Kategorien oder Lieferanten suchen…",
      "Tìm sản phẩm, danh mục hoặc nhà cung cấp…",
    ),
    browse: t("Browse products", "Przeglądaj produkty", "Produkte durchsuchen", "Xem sản phẩm"),
    sellerNudge: t(
      "Are you a wholesaler?",
      "Jesteś hurtownikiem?",
      "Sind Sie Großhändler?",
      "Bạn là nhà bán buôn?",
    ),
    listCta: t(
      "List your catalog →",
      "Dodaj swój katalog →",
      "Katalog einstellen →",
      "Đăng danh mục →",
    ),
    stat1: t(
      "verified suppliers",
      "zweryfikowanych dostawców",
      "verifizierte Lieferanten",
      "nhà cung cấp đã xác minh",
    ),
    stat2: t(
      "clothing categories",
      "kategorii odzieży",
      "Bekleidungskategorien",
      "danh mục quần áo",
    ),
    stat3: t("live products", "aktywnych produktów", "aktive Produkte", "sản phẩm đang có"),
    stat4Bold: t("No account", "Bez konta", "Kein Konto", "Không cần tài khoản"),
    stat4Tail: t("needed to inquire", "aby zapytać", "nötig für Anfragen", "để gửi yêu cầu"),
  },
  cats: {
    kicker: t("01 — Categories", "01 — Kategorie", "01 — Kategorien", "01 — Danh mục"),
    heading: t(
      "Browse by category",
      "Przeglądaj według kategorii",
      "Nach Kategorie stöbern",
      "Duyệt theo danh mục",
    ),
    hintOpen: t(
      "Click again to close",
      "Kliknij ponownie, aby zamknąć",
      "Zum Schließen erneut klicken",
      "Nhấn lại để đóng",
    ),
    hintIdle: t(
      "Click a category to explore",
      "Kliknij kategorię, aby zobaczyć",
      "Kategorie anklicken zum Erkunden",
      "Nhấn danh mục để khám phá",
    ),
    suppliersLabel: t("suppliers", "dostawców", "Lieferanten", "nhà cung cấp"),
    subcategoriesLabel: t("subcategories", "podkategorie", "Unterkategorien", "danh mục con"),
    explore: t("Explore", "Odkrywaj", "Erkunden", "Khám phá"),
    subsHeading: t("subcategories", "podkategorie", "Unterkategorien", "danh mục con"),
    close: t("Close ✕", "Zamknij ✕", "Schließen ✕", "Đóng ✕"),
  },
  sellers: {
    kicker: t(
      "02 — Verified Sellers",
      "02 — Zweryfikowani dostawcy",
      "02 — Verifizierte Verkäufer",
      "02 — Nhà cung cấp đã xác minh",
    ),
    heading: t(
      "Featured suppliers this week",
      "Wyróżnieni dostawcy w tym tygodniu",
      "Empfohlene Lieferanten diese Woche",
      "Nhà cung cấp nổi bật tuần này",
    ),
    verified: t("✓ Verified", "✓ Zweryfikowany", "✓ Verifiziert", "✓ Đã xác minh"),
    est: t("Est.", "Zał.", "Gegr.", "Thành lập"),
    products: t("products", "produktów", "Produkte", "sản phẩm"),
    visit: t("Visit store →", "Zobacz sklep →", "Shop besuchen →", "Xem gian hàng →"),
  },
  trend: {
    kicker: t("03 — Trending", "03 — Popularne", "03 — Trends", "03 — Xu hướng"),
    heading: t(
      "Most inquired products this week",
      "Najczęściej pytane produkty w tym tygodniu",
      "Meistgefragte Produkte diese Woche",
      "Sản phẩm được hỏi nhiều nhất tuần này",
    ),
    moq: t("MOQ", "MOQ", "MBM", "MOQ"),
    packSize: t("Pack size", "Rozmiar opakowania", "Packungsgröße", "Kích cỡ kiện"),
    priceOnInquiry: t(
      "Price on inquiry",
      "Cena na zapytanie",
      "Preis auf Anfrage",
      "Giá theo yêu cầu",
    ),
    ask: t(
      "Ask about this product",
      "Zapytaj o produkt",
      "Zu diesem Produkt anfragen",
      "Hỏi về sản phẩm",
    ),
    waLabel: t(
      "WhatsApp seller",
      "WhatsApp do sprzedawcy",
      "Verkäufer per WhatsApp",
      "WhatsApp người bán",
    ),
  },
  stock: {
    in: t("In stock", "W magazynie", "Auf Lager", "Còn hàng"),
    low: t("Low stock", "Niski stan", "Wenig auf Lager", "Sắp hết"),
  },
  pack: {
    of: t("Pack of", "Opakowanie po", "Packung à", "Kiện"),
    pcs: t("pcs", "szt.", "Stk.", "cái"),
  },
  how: {
    kicker: t(
      "04 — How it works",
      "04 — Jak to działa",
      "04 — So funktioniert's",
      "04 — Cách hoạt động",
    ),
    heading: t(
      "Sourcing, simplified.",
      "Zakupy hurtowe, uproszczone.",
      "Beschaffung, vereinfacht.",
      "Tìm nguồn hàng, đơn giản hơn.",
    ),
    s1t: t("Browse", "Przeglądaj", "Durchsuchen", "Duyệt"),
    s1d: t(
      "Search products or open a supplier's storefront. No account needed.",
      "Szukaj produktów lub wejdź do sklepu dostawcy. Bez konta.",
      "Produkte suchen oder Lieferanten-Shop öffnen. Kein Konto nötig.",
      "Tìm sản phẩm hoặc mở gian hàng nhà cung cấp. Không cần tài khoản.",
    ),
    s2t: t("Inquire", "Zapytaj", "Anfragen", "Hỏi"),
    s2d: t(
      "Ask about a product or WhatsApp the seller directly — quantity, colors, destination.",
      "Zapytaj o produkt lub napisz na WhatsApp — ilość, kolory, kraj dostawy.",
      "Nach einem Produkt fragen oder direkt per WhatsApp — Menge, Farben, Zielland.",
      "Hỏi về sản phẩm hoặc nhắn WhatsApp trực tiếp — số lượng, màu, điểm đến.",
    ),
    s3t: t(
      "Contact seller",
      "Skontaktuj się ze sprzedawcą",
      "Verkäufer kontaktieren",
      "Liên hệ người bán",
    ),
    s3d: t(
      "Talk to the supplier, agree terms, and source directly. Bazoria stays out of the deal.",
      "Rozmawiaj z dostawcą, uzgodnij warunki i kupuj bezpośrednio. Bazoria nie pośredniczy w transakcji.",
      "Sprechen Sie mit dem Lieferanten, vereinbaren Sie die Konditionen und kaufen Sie direkt. Bazoria bleibt außen vor.",
      "Trao đổi với nhà cung cấp, thống nhất điều khoản và mua trực tiếp. Bazoria không tham gia giao dịch.",
    ),
  },
  cta: {
    heading: t(
      "Bring your wholesale catalog online.",
      "Umieść swój katalog hurtowy online.",
      "Bringen Sie Ihren Großhandelskatalog online.",
      "Đưa danh mục bán buôn của bạn lên mạng.",
    ),
    body: t(
      "Create a branded catalog, showcase your products, and capture buyer inquiries from retailers and resellers — right from your phone.",
      "Stwórz markowy katalog, pokaż produkty i zbieraj zapytania od sklepów i resellerów — prosto z telefonu.",
      "Erstellen Sie einen Marken-Katalog, präsentieren Sie Ihre Produkte und sammeln Sie Anfragen von Händlern und Wiederverkäufern — direkt vom Handy.",
      "Tạo danh mục có thương hiệu, giới thiệu sản phẩm và nhận yêu cầu từ nhà bán lẻ và người bán lại — ngay trên điện thoại.",
    ),
  },
  footer: {
    tagline: t(
      "A wholesale discovery platform for retailers, online sellers and resellers — find real suppliers, browse digital catalogs, and contact sellers directly.",
      "Platforma odkrywania hurtu dla sklepów, sprzedawców online i resellerów — znajdź dostawców, przeglądaj katalogi cyfrowe i pisz do nich bezpośrednio.",
      "Eine Plattform zum Entdecken von Großhandel für Händler, Online-Verkäufer und Wiederverkäufer — echte Lieferanten finden, digitale Kataloge durchsuchen und direkt kontaktieren.",
      "Nền tảng khám phá bán buôn dành cho nhà bán lẻ, người bán online và người bán lại — tìm nhà cung cấp, duyệt danh mục và liên hệ trực tiếp.",
    ),
    buyers: t("Buyers", "Kupujący", "Käufer", "Người mua"),
    sellers: t("Sellers", "Sprzedawcy", "Verkäufer", "Người bán"),
    fBrowse: t(
      "Browse categories",
      "Przeglądaj kategorie",
      "Kategorien durchsuchen",
      "Duyệt danh mục",
    ),
    fFeatured: t(
      "Featured suppliers",
      "Wyróżnieni dostawcy",
      "Empfohlene Lieferanten",
      "Nhà cung cấp nổi bật",
    ),
    fHow: t("How it works", "Jak to działa", "So funktioniert's", "Cách hoạt động"),
    fList: t("List your catalog", "Dodaj katalog", "Katalog einstellen", "Đăng danh mục"),
    fOnboarding: t(
      "Onboarding & CSV import",
      "Onboarding i import CSV",
      "Onboarding & CSV-Import",
      "Onboarding & nhập CSV",
    ),
    fPricing: t("Pricing", "Cennik", "Preise", "Bảng giá"),
    rights: t(
      "All rights reserved.",
      "Wszelkie prawa zastrzeżone.",
      "Alle Rechte vorbehalten.",
      "Mọi quyền được bảo lưu.",
    ),
    terms: t("Terms", "Regulamin", "AGB", "Điều khoản"),
    privacy: t("Privacy", "Prywatność", "Datenschutz", "Bảo mật"),
    contact: t("Contact", "Kontakt", "Kontakt", "Liên hệ"),
  },
};

// ---------------- Data ----------------

type Category = {
  slug: "menswear" | "womenswear" | "kidswear";
  count: number;
  image: string;
  name: T;
  tagline: T;
  subcategories: { name: T; count: number }[];
};

const categories: Category[] = [
  {
    slug: "menswear",
    count: 312,
    image: "/assets/marketplace/category-menswear.jpg",
    name: t("Menswear", "Odzież męska", "Herrenmode", "Thời trang nam"),
    tagline: t(
      "Wholesale menswear for retail stores, online sellers and resellers.",
      "Hurtowa odzież męska dla sklepów, sprzedawców online i resellerów.",
      "Herrenmode im Großhandel für Läden, Online-Händler und Wiederverkäufer.",
      "Thời trang nam bán buôn cho cửa hàng, người bán online và người bán lại.",
    ),
    subcategories: [
      { name: t("Shirts", "Koszule", "Hemden", "Áo sơ mi"), count: 84 },
      {
        name: t("T-Shirts & Polos", "T-shirty i polo", "T-Shirts & Polos", "Áo thun & polo"),
        count: 62,
      },
      {
        name: t("Jackets & Outerwear", "Kurtki i okrycia", "Jacken & Mäntel", "Áo khoác"),
        count: 48,
      },
      {
        name: t("Trousers & Chinos", "Spodnie i chinosy", "Hosen & Chinos", "Quần âu & chinos"),
        count: 41,
      },
      { name: t("Denim & Jeans", "Denim i jeansy", "Denim & Jeans", "Denim & jeans"), count: 38 },
      {
        name: t("Suits & Blazers", "Garnitury i marynarki", "Anzüge & Sakkos", "Vest & blazer"),
        count: 21,
      },
      {
        name: t("Innerwear & Basics", "Bielizna i basic", "Unterwäsche & Basics", "Đồ lót & basic"),
        count: 18,
      },
    ],
  },
  {
    slug: "womenswear",
    count: 486,
    image: "/assets/marketplace/category-womenswear.jpg",
    name: t("Womenswear", "Odzież damska", "Damenmode", "Thời trang nữ"),
    tagline: t(
      "Wholesale womenswear from real suppliers — ready to resell.",
      "Hurtowa odzież damska od prawdziwych dostawców — gotowa do odsprzedaży.",
      "Damenmode aus dem Großhandel von echten Lieferanten — bereit zum Weiterverkauf.",
      "Thời trang nữ bán buôn từ nhà cung cấp thật — sẵn sàng bán lại.",
    ),
    subcategories: [
      { name: t("Dresses", "Sukienki", "Kleider", "Váy"), count: 132 },
      { name: t("Tops & Blouses", "Topy i bluzki", "Tops & Blusen", "Áo & blouse"), count: 96 },
      {
        name: t("Two-Piece Sets", "Komplety dwuczęściowe", "Zweiteiler", "Bộ hai mảnh"),
        count: 74,
      },
      {
        name: t(
          "Jumpsuits & Playsuits",
          "Kombinezony",
          "Jumpsuits & Playsuits",
          "Jumpsuit & playsuit",
        ),
        count: 42,
      },
      { name: t("Knitwear", "Dzianiny", "Strickwaren", "Đồ dệt kim"), count: 68 },
      { name: t("Outerwear", "Okrycia wierzchnie", "Oberbekleidung", "Áo khoác"), count: 51 },
      { name: t("Loungewear", "Loungewear", "Loungewear", "Đồ mặc nhà"), count: 23 },
    ],
  },
  {
    slug: "kidswear",
    count: 178,
    image: "/assets/marketplace/category-kidswear.jpg",
    name: t("Kidswear", "Odzież dziecięca", "Kindermode", "Thời trang trẻ em"),
    tagline: t(
      "Wholesale kids clothing for boutiques, online shops and market vendors.",
      "Hurtowa odzież dziecięca dla butików, sklepów online i handlarzy bazarowych.",
      "Kinderbekleidung im Großhandel für Boutiquen, Online-Shops und Marktverkäufer.",
      "Quần áo trẻ em bán buôn cho boutique, cửa hàng online và tiểu thương.",
    ),
    subcategories: [
      { name: t("Boys (2–12)", "Chłopcy (2–12)", "Jungen (2–12)", "Bé trai (2–12)"), count: 46 },
      {
        name: t("Girls (2–12)", "Dziewczynki (2–12)", "Mädchen (2–12)", "Bé gái (2–12)"),
        count: 52,
      },
      { name: t("Infants (0–2)", "Niemowlęta (0–2)", "Babys (0–2)", "Sơ sinh (0–2)"), count: 34 },
      { name: t("School Uniforms", "Mundurki szkolne", "Schuluniformen", "Đồng phục"), count: 18 },
      { name: t("Party Wear", "Odzież imprezowa", "Festliche Kleidung", "Đồ dự tiệc"), count: 16 },
      { name: t("Winter Wear", "Odzież zimowa", "Winterkleidung", "Đồ mùa đông"), count: 12 },
    ],
  },
];

type Seller = {
  slug: string;
  name: string;
  city: T;
  tag: T;
  established: string;
  products: number;
  image: string;
  verified: boolean;
  link?: "/demo/kesar-textiles";
};

const featuredSellers: Seller[] = [
  {
    slug: "kesar-textiles",
    name: "Kesar Textiles",
    city: t(
      "Global Textiles Hub",
      "Międzynarodowe centrum tekstylne",
      "Globales Textilzentrum",
      "Trung tâm dệt may toàn cầu",
    ),
    tag: t("Cotton Fabric", "Tkaniny bawełniane", "Baumwollstoffe", "Vải cotton"),
    established: "1998",
    products: 84,
    image: "/assets/marketplace/seller-kesar.jpg",
    verified: true,
    link: "/demo/kesar-textiles",
  },
  {
    slug: "heritage-silk",
    name: "Heritage Silk Guild",
    city: t("Heritage Quarter", "Dzielnica dziedzictwa", "Historisches Viertel", "Khu di sản"),
    tag: t("Silk & Luxury", "Jedwab i luksus", "Seide & Luxus", "Lụa & cao cấp"),
    established: "1972",
    products: 61,
    image: "/assets/marketplace/seller-silk.jpg",
    verified: true,
  },
  {
    slug: "indigo-denim",
    name: "Indigo Denim Co.",
    city: t("Denim District", "Dzielnica denimowa", "Denim-Viertel", "Khu denim"),
    tag: t("Denim & Jeans", "Denim i jeansy", "Denim & Jeans", "Denim & jeans"),
    established: "2005",
    products: 42,
    image: "/assets/marketplace/seller-denim.jpg",
    verified: true,
  },
  {
    slug: "petal-kidswear",
    name: "Petal Kidswear",
    city: t(
      "Kidswear Valley",
      "Dolina odzieży dziecięcej",
      "Kindermode-Tal",
      "Thung lũng thời trang trẻ em",
    ),
    tag: t("Kidswear", "Odzież dziecięca", "Kindermode", "Thời trang trẻ em"),
    established: "2011",
    products: 38,
    image: "/assets/marketplace/seller-kidswear.jpg",
    verified: false,
  },
  {
    slug: "highland-knits",
    name: "Highland Knits",
    city: t(
      "Northern Knits District",
      "Północna dzielnica dzianin",
      "Nördliches Strickviertel",
      "Khu dệt kim phía Bắc",
    ),
    tag: t("Knitwear", "Dzianiny", "Strickwaren", "Đồ dệt kim"),
    established: "2002",
    products: 29,
    image: "/assets/marketplace/seller-knitwear.jpg",
    verified: true,
  },
  {
    slug: "north-menswear",
    name: "North Menswear Mills",
    city: t(
      "Metro Menswear District",
      "Miejska dzielnica męskiej mody",
      "Metro-Herrenmodeviertel",
      "Khu thời trang nam đô thị",
    ),
    tag: t("Menswear", "Odzież męska", "Herrenmode", "Thời trang nam"),
    established: "1995",
    products: 57,
    image: "/assets/marketplace/seller-menswear.jpg",
    verified: true,
  },
];

type Trending = {
  name: T;
  seller: string;
  moq: number; // pcs
  packOf: number;
  stockKey: "in" | "low";
  img: string;
};

const trending: Trending[] = [
  {
    name: t(
      "Oversized Cotton Tee — Unisex",
      "Oversize'owy T-shirt bawełniany — unisex",
      "Oversize Baumwoll-T-Shirt — Unisex",
      "Áo thun cotton oversize — unisex",
    ),
    seller: "North Menswear Mills",
    moq: 50,
    packOf: 10,
    stockKey: "in",
    img: "/assets/kesar/product-1.jpg",
  },
  {
    name: t(
      "Printed Summer Dress",
      "Letnia sukienka z nadrukiem",
      "Bedrucktes Sommerkleid",
      "Váy hè họa tiết",
    ),
    seller: "Heritage Silk Guild",
    moq: 30,
    packOf: 6,
    stockKey: "in",
    img: "/assets/kesar/product-2.jpg",
  },
  {
    name: t(
      "Kids Cotton Set (2–8y)",
      "Bawełniany komplet dziecięcy (2–8 lat)",
      "Kinder-Baumwollset (2–8 J.)",
      "Bộ cotton trẻ em (2–8 tuổi)",
    ),
    seller: "Petal Kidswear",
    moq: 40,
    packOf: 8,
    stockKey: "low",
    img: "/assets/kesar/product-3.jpg",
  },
  {
    name: t(
      "Slim-Fit Denim Jeans",
      "Dżinsy o kroju slim",
      "Slim-Fit Denim-Jeans",
      "Quần jeans slim-fit",
    ),
    seller: "Indigo Denim Co.",
    moq: 60,
    packOf: 12,
    stockKey: "in",
    img: "/assets/kesar/product-4.jpg",
  },
];

// ---------------- Components ----------------

function LanguageSwitcher() {
  const { lang, setLang } = useContext(LangContext);
  return (
    <div
      className="hidden items-center gap-1 border border-border px-1 py-0.5 sm:inline-flex"
      role="group"
      aria-label="Language"
    >
      {languages.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            lang === l
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          aria-pressed={lang === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("EN");
  const [isPending, startTransition] = useTransition();
  const setLang = (l: Lang) => startTransition(() => setLangState(l));
  return (
    <LangContext.Provider value={{ lang, setLang, isPending }}>{children}</LangContext.Provider>
  );
}

function MarketplacePage() {
  return (
    <LangProvider>
      <MarketplaceInner />
    </LangProvider>
  );
}

function MarketplaceInner() {
  const [openCategory, setOpenCategory] = useState<Category["slug"] | null>(null);
  const lang = useLang();
  const { isPending } = useContext(LangContext);
  const tr = (dict: T) => translate(dict, lang);

  return (
    <div className="storefront-dark min-h-screen bg-background text-foreground">
      {/* Language switch progress bar */}
      <div
        aria-hidden
        className={`fixed left-0 right-0 top-0 z-50 h-0.5 origin-left bg-primary transition-transform duration-300 ease-out ${
          isPending ? "scale-x-100" : "scale-x-0"
        }`}
      />
      <div
        className={`transition-opacity duration-200 ${isPending ? "opacity-60" : "opacity-100"}`}
        aria-busy={isPending}
      >
        {/* Nav */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center border border-primary/40 bg-primary/10 font-display text-sm font-bold text-primary">
                B
              </div>
              <span className="font-display text-lg font-semibold tracking-tight">Bazoria</span>
            </div>
            <nav className="hidden gap-8 text-sm text-muted-foreground md:flex">
              <a href="#categories" className="hover:text-foreground">
                {tr(ui.nav.products)}
              </a>
              <a href="#sellers" className="hover:text-foreground">
                {tr(ui.nav.suppliers)}
              </a>
              <a href="#trending" className="hover:text-foreground">
                {tr(ui.nav.trending)}
              </a>
              <a href="#how" className="hover:text-foreground">
                {tr(ui.nav.how)}
              </a>
            </nav>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <Link
                to="/auth"
                className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
              >
                {tr(ui.nav.signIn)}
              </Link>
              <a
                href="#for-sellers"
                className="hidden items-center gap-2 bg-primary px-4 py-2 text-xs font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex"
              >
                {tr(ui.nav.listCatalog)}
              </a>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0">
            <img
              src="/assets/marketplace/hero-marketplace-light.jpg"
              alt=""
              className="h-full w-full object-cover opacity-70"
              width={1600}
              height={900}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
          </div>
          <div className="relative mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-12 lg:pb-8 lg:pt-12">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-primary">
              {tr(ui.hero.kicker)}
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              {tr(ui.hero.titleA)}
              <br />
              <span className="text-primary">{tr(ui.hero.titleB)}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              {tr(ui.hero.lead)}
            </p>

            {/* Search */}
            <div className="mt-8 flex max-w-2xl flex-col gap-2 sm:flex-row">
              <div className="flex flex-1 items-center border border-border bg-card/70 px-4 py-3 backdrop-blur">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="mr-3 text-muted-foreground"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder={pick(ui.hero.searchPlaceholder, lang)}
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <button className="bg-primary px-6 py-3 text-xs font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90">
                {tr(ui.hero.browse)}
              </button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {tr(ui.hero.sellerNudge)}{" "}
              <a href="#for-sellers" className="text-primary underline-offset-4 hover:underline">
                {tr(ui.hero.listCta)}
              </a>
            </p>

            <div className="mt-5 hidden flex-wrap gap-x-8 gap-y-3 text-xs text-muted-foreground 2xl:flex">
              <span>
                <span className="font-medium text-foreground">900+</span> {tr(ui.hero.stat1)}
              </span>
              <span>
                <span className="font-medium text-foreground">3</span> {tr(ui.hero.stat2)}
              </span>
              <span>
                <span className="font-medium text-foreground">12,400+</span> {tr(ui.hero.stat3)}
              </span>
              <span>
                <span className="font-medium text-foreground">{tr(ui.hero.stat4Bold)}</span>{" "}
                {tr(ui.hero.stat4Tail)}
              </span>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section id="categories" className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pb-12 sm:pt-9">
            <div className="mb-5 flex items-end justify-between sm:mb-6">
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-primary">
                  {tr(ui.cats.kicker)}
                </p>
                <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {tr(ui.cats.heading)}
                </h2>
              </div>
              <span className="hidden text-xs uppercase tracking-wider text-muted-foreground sm:inline">
                {openCategory ? tr(ui.cats.hintOpen) : tr(ui.cats.hintIdle)}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {categories.map((c) => {
                const isOpen = openCategory === c.slug;
                const catName = pick(c.name, lang);
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setOpenCategory(isOpen ? null : c.slug)}
                    className={`group relative overflow-hidden border text-left transition-colors ${
                      isOpen ? "border-primary" : "border-border hover:border-primary/50"
                    }`}
                    aria-expanded={isOpen}
                  >
                    <div className="relative aspect-[4/5] overflow-hidden">
                      <img
                        src={c.image}
                        alt={catName}
                        loading="lazy"
                        width={800}
                        height={1000}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <div className="font-display text-2xl font-semibold text-foreground">
                          {catName}
                        </div>
                        <p className="mt-1.5 max-w-[22rem] text-xs leading-relaxed text-muted-foreground">
                          {pick(c.tagline, lang)}
                        </p>
                        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                          <span>
                            {c.count} {tr(ui.cats.suppliersLabel)} · {c.subcategories.length}{" "}
                            {tr(ui.cats.subcategoriesLabel)}
                          </span>
                          <span
                            className={`font-mono uppercase tracking-wider text-primary transition-transform ${isOpen ? "rotate-90" : ""}`}
                          >
                            →
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {openCategory && (
              <div className="mt-6 border border-primary/40 bg-card">
                {(() => {
                  const cat = categories.find((c) => c.slug === openCategory)!;
                  return (
                    <div className="p-6 sm:p-8">
                      <div className="mb-5 flex items-end justify-between border-b border-border pb-4">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
                            {tr(ui.cats.explore)}
                          </p>
                          <h3 className="mt-1 font-display text-xl font-semibold">
                            {pick(cat.name, lang)} — {tr(ui.cats.subsHeading)}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOpenCategory(null)}
                          className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        >
                          {tr(ui.cats.close)}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4">
                        {cat.subcategories.map((s) => (
                          <a
                            key={s.name.EN}
                            href="#"
                            className="group flex items-center justify-between bg-card px-4 py-4 transition-colors hover:bg-secondary"
                          >
                            <div>
                              <div className="font-display text-sm font-medium text-card-foreground">
                                {pick(s.name, lang)}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {s.count} {tr(ui.cats.suppliersLabel)}
                              </div>
                            </div>
                            <span className="text-primary opacity-0 transition-opacity group-hover:opacity-100">
                              →
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </section>

        {/* Featured sellers */}
        <section id="sellers" className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mb-10 flex items-end justify-between">
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-primary">
                  {tr(ui.sellers.kicker)}
                </p>
                <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {tr(ui.sellers.heading)}
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredSellers.map((s) => {
                const Card = (
                  <div className="group flex h-full flex-col border border-border bg-card transition-colors hover:border-primary/50">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img
                        src={s.image}
                        alt={s.name}
                        loading="lazy"
                        width={800}
                        height={600}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      {s.verified && (
                        <div className="absolute left-3 top-3 flex items-center gap-1 border border-primary/40 bg-background/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary backdrop-blur">
                          {tr(ui.sellers.verified)}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {pick(s.tag, lang)}
                      </div>
                      <div className="font-display text-lg font-semibold text-card-foreground">
                        {s.name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {pick(s.city, lang)} · {tr(ui.sellers.est)} {s.established}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                        <span className="text-xs text-muted-foreground">
                          {s.products} {tr(ui.sellers.products)}
                        </span>
                        <span className="text-xs uppercase tracking-wider text-primary">
                          {tr(ui.sellers.visit)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
                return s.link ? (
                  <Link key={s.slug} to={s.link}>
                    {Card}
                  </Link>
                ) : (
                  <a key={s.slug} href="#">
                    {Card}
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        {/* Trending products */}
        <section id="trending" className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mb-10 flex items-end justify-between">
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-primary">
                  {tr(ui.trend.kicker)}
                </p>
                <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {tr(ui.trend.heading)}
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {trending.map((p) => {
                const inStock = p.stockKey === "in";
                const pName = pick(p.name, lang);
                return (
                  <div
                    key={p.name.EN}
                    className="group flex flex-col border border-border bg-card transition-colors hover:border-primary/50"
                  >
                    <a href="#" className="block aspect-square overflow-hidden">
                      <img
                        src={p.img}
                        alt={pName}
                        loading="lazy"
                        width={600}
                        height={600}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </a>
                    <div className="flex flex-1 flex-col p-4">
                      <a
                        href="#"
                        className="font-display text-sm font-medium text-card-foreground hover:text-primary"
                      >
                        {pName}
                      </a>
                      <div className="mt-1 text-xs text-muted-foreground">{p.seller}</div>

                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                        <div>
                          <div className="font-mono uppercase tracking-wider text-[10px] opacity-70">
                            {tr(ui.trend.moq)}
                          </div>
                          <div className="text-foreground">
                            {p.moq} {tr(ui.pack.pcs)}
                          </div>
                        </div>
                        <div>
                          <div className="font-mono uppercase tracking-wider text-[10px] opacity-70">
                            {tr(ui.trend.packSize)}
                          </div>
                          <div className="text-foreground">
                            {tr(ui.pack.of)} {p.packOf}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <span
                          className={`inline-flex h-1.5 w-1.5 rounded-full ${inStock ? "bg-emerald-500" : "bg-amber-500"}`}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {inStock ? tr(ui.stock.in) : tr(ui.stock.low)} ·{" "}
                          {tr(ui.trend.priceOnInquiry)}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-1 items-end gap-2">
                        <a
                          href="#"
                          className="flex-1 bg-primary px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          {tr(ui.trend.ask)}
                        </a>
                        <a
                          href="#"
                          aria-label={pick(ui.trend.waLabel, lang)}
                          title={pick(ui.trend.waLabel, lang)}
                          className="inline-flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-[#25D366] hover:text-[#25D366]"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M20.5 3.5A11 11 0 0 0 3.4 17.3L2 22l4.9-1.3a11 11 0 0 0 16.6-9.4 10.9 10.9 0 0 0-3-7.8ZM12.1 20a9 9 0 0 1-4.6-1.3l-.3-.2-2.9.8.8-2.8-.2-.3A9 9 0 1 1 12.1 20Zm5-6.7c-.3-.1-1.6-.8-1.8-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1a7.4 7.4 0 0 1-3.6-3.1c-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5l-.9-2c-.2-.5-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4A3.6 3.6 0 0 0 5.3 9c0 1.6 1.2 3.2 1.3 3.4.2.2 2.3 3.5 5.6 4.9 2 .8 2.8.9 3.8.7.6-.1 1.6-.7 1.9-1.3.2-.7.2-1.2.1-1.3 0-.1-.3-.2-.6-.3Z" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-primary">
              {tr(ui.how.kicker)}
            </p>
            <h2 className="mb-12 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {tr(ui.how.heading)}
            </h2>
            <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
              {[
                { n: "01", t: ui.how.s1t, d: ui.how.s1d },
                { n: "02", t: ui.how.s2t, d: ui.how.s2d },
                { n: "03", t: ui.how.s3t, d: ui.how.s3d },
              ].map((s) => (
                <div key={s.n} className="bg-background p-8">
                  <div className="mb-3 font-mono text-xs text-primary">{s.n}</div>
                  <div className="mb-2 font-display text-xl font-semibold">{pick(s.t, lang)}</div>
                  <p className="text-sm text-muted-foreground">{pick(s.d, lang)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* For sellers CTA */}
        <section id="for-sellers" className="border-b border-border bg-primary">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-14 text-primary-foreground sm:flex-row sm:items-center sm:px-6">
            <div>
              <h3 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {tr(ui.cta.heading)}
              </h3>
              <p className="mt-2 max-w-xl text-sm opacity-90">{tr(ui.cta.body)}</p>
            </div>
            <a
              href="#"
              className="border-2 border-primary-foreground px-6 py-3 text-xs font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary-foreground hover:text-primary"
            >
              {tr(ui.hero.listCta)}
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-background">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center border border-primary/40 bg-primary/10 font-display text-sm font-bold text-primary">
                    B
                  </div>
                  <span className="font-display text-lg font-semibold">Bazoria</span>
                </div>
                <p className="mt-4 max-w-sm text-sm text-muted-foreground">
                  {tr(ui.footer.tagline)}
                </p>
              </div>
              <div>
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {tr(ui.footer.buyers)}
                </div>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a href="#categories" className="hover:text-primary">
                      {tr(ui.footer.fBrowse)}
                    </a>
                  </li>
                  <li>
                    <a href="#sellers" className="hover:text-primary">
                      {tr(ui.footer.fFeatured)}
                    </a>
                  </li>
                  <li>
                    <a href="#how" className="hover:text-primary">
                      {tr(ui.footer.fHow)}
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {tr(ui.footer.sellers)}
                </div>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a href="#for-sellers" className="hover:text-primary">
                      {tr(ui.footer.fList)}
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-primary">
                      {tr(ui.footer.fOnboarding)}
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-primary">
                      {tr(ui.footer.fPricing)}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
              <span>© 2026 Bazoria. {tr(ui.footer.rights)}</span>
              <div className="flex gap-6">
                <a href="#" className="hover:text-primary">
                  {tr(ui.footer.terms)}
                </a>
                <a href="#" className="hover:text-primary">
                  {tr(ui.footer.privacy)}
                </a>
                <a href="#" className="hover:text-primary">
                  {tr(ui.footer.contact)}
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
