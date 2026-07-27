import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  CheckCircle,
  MapPin,
  Mail,
  Phone,
  MessageCircle,
  Search,
  Menu,
  X,
} from "lucide-react";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";

export const Route = createFileRoute("/demo/kesar-textiles")({
  head: () => ({
    meta: [
      { title: "Kesar Textiles | Wholesale Cotton Fabrics" },
      {
        name: "description",
        content:
          "Premium wholesale cotton textiles. B2B catalog with MOQ pricing, inquiry forms, and direct WhatsApp contact.",
      },
      { property: "og:title", content: "Kesar Textiles | Wholesale Cotton Fabrics" },
      {
        property: "og:description",
        content:
          "Premium wholesale cotton textiles. B2B catalog with MOQ pricing, inquiry forms, and direct WhatsApp contact.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KesarTextilesDemo,
});

// ---------- i18n ----------

const kesarLanguages = ["EN", "PL", "DE", "VI"] as const;
type Lang = (typeof kesarLanguages)[number];
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

const useLang = () => useContext(LangContext).lang;

// Safely pick a translation, falling back to English (then any available value)
// so a missing/empty entry never breaks the UI.
function pick(dict: T | undefined | null, lang: Lang): string {
  if (!dict) return "";
  const val = dict[lang];
  if (val != null && val !== "") return val;
  if (dict.EN) return dict.EN;
  for (const l of kesarLanguages) {
    const v = dict[l];
    if (v) return v;
  }
  return "";
}

const translate = (dict: T, lang: Lang) => pick(dict, lang);

const ui = {
  nav: {
    catalog: t("Catalog", "Katalog", "Katalog", "Danh mục"),
    categories: t("Categories", "Kategorie", "Kategorien", "Danh mục"),
    about: t("About", "O nas", "Über uns", "Về chúng tôi"),
    contact: t("Contact", "Kontakt", "Kontakt", "Liên hệ"),
  },
  productsLabel: t("products", "produktów", "Produkte", "sản phẩm"),
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
};

// ---------- Data ----------

type Category = { name: T; count: number; image: string };

const categories: Category[] = [
  {
    name: t("Cotton Prints", "Nadruki bawełniane", "Baumwolldrucke", "Cotton in họa tiết"),
    count: 42,
    image: "/assets/kesar/category-cotton-prints.jpg",
  },
  {
    name: t("Solid Dyed", "Farbowane jednolite", "Uni gefärbt", "Nhuộm trơn"),
    count: 38,
    image: "/assets/kesar/category-solid-dyed.jpg",
  },
  {
    name: t("Bedsheets", "Pościel", "Bettwäsche", "Ga giường"),
    count: 24,
    image: "/assets/kesar/category-bedsheets.jpg",
  },
  {
    name: t("Curtain Fabric", "Tkanina na zasłony", "Vorhangstoff", "Vải rèm"),
    count: 19,
    image: "/assets/kesar/category-curtain-fabric.jpg",
  },
  {
    name: t("Dress Material", "Materiał na sukienki", "Kleiderstoff", "Vải may váy"),
    count: 56,
    image: "/assets/kesar/category-dress-material.jpg",
  },
  {
    name: t("Export Rejects", "Odrzuty eksportowe", "Exportausschuss", "Hàng loại xuất khẩu"),
    count: 12,
    image: "/assets/kesar/category-export-rejects.jpg",
  },
];

type Product = { id: number; title: T; moq: string; price: string; image: string };

const products: Product[] = [
  {
    id: 1,
    title: t(
      "Terracotta Cambric Cotton",
      "Bawełna kambryk terakota",
      "Terrakotta-Kambrik-Baumwolle",
      "Cotton cambric màu terracotta",
    ),
    moq: "500m",
    price: "$85–120/m",
    image: "/assets/kesar/product-1.jpg",
  },
  {
    id: 2,
    title: t(
      "Indigo Block Print Cotton",
      "Bawełna z nadrukiem blokowym indygo",
      "Indigo-Blockdruck-Baumwolle",
      "Cotton in khối indigo",
    ),
    moq: "300m",
    price: "$110–165/m",
    image: "/assets/kesar/product-2.jpg",
  },
  {
    id: 3,
    title: t(
      "Ivory Bedsheet Cotton",
      "Bawełna pościelowa ecru",
      "Elfenbein-Bettwäsche-Baumwolle",
      "Cotton ga giường ngà",
    ),
    moq: "1,000m",
    price: "$65–95/m",
    image: "/assets/kesar/product-3.jpg",
  },
  {
    id: 4,
    title: t(
      "Olive Curtain Cotton",
      "Bawełna na zasłony oliwkowa",
      "Oliv-Vorhang-Baumwolle",
      "Cotton rèm olive",
    ),
    moq: "400m",
    price: "$140–190/m",
    image: "/assets/kesar/product-4.jpg",
  },
  {
    id: 5,
    title: t(
      "Mustard Voile Cotton",
      "Bawełna woal musztardowa",
      "Senf-Voile-Baumwolle",
      "Cotton voile mustard",
    ),
    moq: "500m",
    price: "$75–105/m",
    image: "/assets/kesar/product-1.jpg",
  },
  {
    id: 6,
    title: t(
      "Azure Artisan Print",
      "Rzemieślniczy nadruk lazurowy",
      "Azurblauer Artisan-Druck",
      "In thủ công màu azure",
    ),
    moq: "350m",
    price: "$125–180/m",
    image: "/assets/kesar/product-2.jpg",
  },
  {
    id: 7,
    title: t(
      "Natural White Sheeting",
      "Naturalna biała pościel",
      "Naturweißes Sheeting",
      "Vải sheeting trắng tự nhiên",
    ),
    moq: "800m",
    price: "$55–80/m",
    image: "/assets/kesar/product-3.jpg",
  },
  {
    id: 8,
    title: t(
      "Sage Upholstery Cotton",
      "Bawełna tapicerska szałwiowa",
      "Salbei-Polster-Baumwolle",
      "Cotton bọc ghế màu sage",
    ),
    moq: "250m",
    price: "$160–220/m",
    image: "/assets/kesar/product-4.jpg",
  },
];

const navLinks = [
  { label: ui.nav.catalog, href: "#catalog" },
  { label: ui.nav.categories, href: "#categories" },
  { label: ui.nav.about, href: "#about" },
  { label: ui.nav.contact, href: "#contact" },
];

const whatsappNumber = "+1 555 123 4567";
const whatsappHref = `https://wa.me/${whatsappNumber.replace(/\D/g, "")}`;

function LanguageSwitcher() {
  const { lang, setLang } = useContext(LangContext);
  return (
    <div
      className="hidden items-center gap-1 border border-border/60 px-1 py-0.5 sm:inline-flex"
      role="group"
      aria-label="Language"
    >
      {kesarLanguages.map((l) => (
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

function KesarTextilesDemo() {
  const [lang, setLangState] = useState<Lang>("EN");
  const [isPending, startTransition] = useTransition();
  const setLang = (l: Lang) => startTransition(() => setLangState(l));
  return (
    <LangContext.Provider value={{ lang, setLang, isPending }}>
      <KesarInner />
    </LangContext.Provider>
  );
}

function KesarInner() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const lang = useLang();
  const { isPending } = useContext(LangContext);
  const tr = (dict: T) => translate(dict, lang);

  return (
    <div className="storefront-dark bg-background text-foreground min-h-screen font-sans">
      <div
        aria-hidden
        className={`fixed left-0 right-0 top-0 z-[60] h-0.5 origin-left bg-primary transition-transform duration-300 ease-out ${
          isPending ? "scale-x-100" : "scale-x-0"
        }`}
      />
      <div
        className={`transition-opacity duration-200 ${isPending ? "opacity-60" : "opacity-100"}`}
        aria-busy={isPending}
      >
        {/* Top nav */}
        <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-primary/40 bg-primary/10 text-primary font-display font-bold text-lg">
                K
              </div>
              <div className="flex flex-col">
                <span className="font-display text-lg font-semibold leading-none tracking-tight">
                  Kesar Textiles
                </span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Global · Wholesale
                </span>
              </div>
            </div>

            <nav className="hidden items-center gap-8 md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {pick(link.label, lang)}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 sm:inline-flex"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="border-t border-border/50 px-4 py-4 md:hidden">
              <nav className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {pick(link.label, lang)}
                  </a>
                ))}
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp us
                </a>
              </nav>
            </div>
          )}
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img
              src="/assets/kesar/hero-banner.jpg"
              alt="Kesar Textiles warehouse with cotton fabric rolls"
              className="h-full w-full object-cover opacity-50"
              width={1920}
              height={1088}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
          </div>

          <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1">
                <CheckCircle className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium uppercase tracking-wider text-primary">
                  Verified Wholesale Seller
                </span>
              </div>
              <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                Kesar Textiles
              </h1>
              <p className="mt-6 font-display text-2xl font-medium text-primary sm:text-3xl">
                Premium cotton fabrics, direct from the mill.
              </p>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                Trusted by retailers, exporters, and garment manufacturers across 40+ countries.
                Browse our catalog, check MOQs, and send inquiries in minutes.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button
                  size="lg"
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Browse catalog
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-foreground/20 text-foreground hover:bg-foreground/5"
                >
                  Request a quote
                </Button>
              </div>
              <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  Export ready
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  Custom dyeing
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  Bulk pricing
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section id="categories" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Browse by category
              </h2>
              <p className="mt-2 text-muted-foreground">191 fabrics across 6 core collections.</p>
            </div>
            <a
              href="#catalog"
              className="hidden items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 sm:inline-flex"
            >
              View all products <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const cName = pick(category.name, lang);
              return (
                <a
                  key={category.name.EN}
                  href="#catalog"
                  className="group relative overflow-hidden border border-border/60 bg-card transition-all hover:border-primary/40"
                >
                  <div className="aspect-[4/3] overflow-hidden">
                    <img
                      src={category.image}
                      alt={cName}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      width={800}
                      height={600}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <h3 className="font-display text-xl font-semibold text-card-foreground">
                      {cName}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {category.count} {tr(ui.productsLabel)}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        {/* Featured products */}
        <section id="catalog" className="border-t border-border/50 bg-secondary/30">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <div className="mb-10 flex items-end justify-between">
              <div>
                <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Featured fabrics
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Best-selling wholesale lines this quarter.
                </p>
              </div>
              <Button
                variant="outline"
                className="hidden border-border/60 text-foreground hover:bg-secondary sm:inline-flex"
              >
                View all 191 products
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="group flex flex-col overflow-hidden border border-border/60 bg-card transition-all hover:border-primary/40"
                >
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <img
                      src={product.image}
                      alt={pick(product.title, lang)}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      width={800}
                      height={1000}
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="font-display text-lg font-medium leading-snug text-card-foreground">
                      {pick(product.title, lang)}
                    </h3>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge
                        variant="secondary"
                        className="bg-secondary text-secondary-foreground hover:bg-secondary"
                      >
                        MOQ: {product.moq}
                      </Badge>
                      <span className="text-sm font-semibold text-primary">{product.price}</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <Button
                        size="sm"
                        className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {tr(ui.ask)}
                      </Button>
                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={pick(ui.waLabel, lang)}
                        title={pick(ui.waLabel, lang)}
                        className="inline-flex h-9 w-9 items-center justify-center border border-border/60 text-muted-foreground transition-colors hover:border-[#25D366] hover:text-[#25D366]"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 text-center sm:hidden">
              <Button
                variant="outline"
                className="border-border/60 text-foreground hover:bg-secondary"
              >
                View all 191 products
              </Button>
            </div>
          </div>
        </section>

        {/* About strip */}
        <section id="about" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Built for wholesale buyers
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                Kesar Textiles has supplied cotton fabrics to retailers, exporters, and garment
                manufacturers for over 27 years. From our mills to over 40 countries, we focus on
                consistent quality, transparent pricing, and reliable delivery.
              </p>
              <div className="mt-8 grid grid-cols-3 gap-6 border-t border-border/50 pt-8">
                <div>
                  <p className="font-display text-3xl font-bold text-primary">27</p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                    Years
                  </p>
                </div>
                <div>
                  <p className="font-display text-3xl font-bold text-primary">40+</p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                    Countries
                  </p>
                </div>
                <div>
                  <p className="font-display text-3xl font-bold text-primary">200+</p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                    SKUs
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="border border-border/60 bg-card p-5">
                  <Search className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 font-display text-lg font-semibold">Catalog browsing</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Filter by category, MOQ, and price range.
                  </p>
                </div>
                <div className="border border-border/60 bg-card p-5">
                  <MessageCircle className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 font-display text-lg font-semibold">Direct inquiries</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    WhatsApp or email — no buyer account required.
                  </p>
                </div>
              </div>
              <div className="space-y-4 pt-8">
                <div className="border border-border/60 bg-card p-5">
                  <Phone className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 font-display text-lg font-semibold">Fast response</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Average reply within 4 business hours.
                  </p>
                </div>
                <div className="border border-border/60 bg-card p-5">
                  <CheckCircle className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 font-display text-lg font-semibold">Verified seller</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vetted profile, sample dispatch available.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Inquiry CTA */}
        <section className="border-t border-border/50 bg-primary/10">
          <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-24">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Ready to source fabrics?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Tell us what you need — quantity, colors, and delivery destination. We will reply with
              pricing and lead times within one business day.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button
                size="lg"
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Mail className="h-4 w-4" />
                Send inquiry
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-foreground/20 text-foreground hover:bg-foreground/5"
                asChild
              >
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  Chat on WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer id="contact" className="border-t border-border/50 bg-background">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center border border-primary/40 bg-primary/10 text-primary font-display font-bold text-lg">
                    K
                  </div>
                  <span className="font-display text-lg font-semibold">Kesar Textiles</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Premium wholesale cotton fabrics. Supplying retailers and exporters worldwide
                  since 1998.
                </p>
              </div>
              <div>
                <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
                  Contact
                </h4>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-4 w-4 text-primary" />
                    +1 555 123 4567
                  </li>
                  <li className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 text-primary" />
                    sales@kesartextiles.com
                  </li>
                  <li className="flex items-start gap-2">
                    <MessageCircle className="mt-0.5 h-4 w-4 text-primary" />
                    WhatsApp business
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
                  Address
                </h4>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  <MapPin className="mb-1 mr-1 inline h-4 w-4 text-primary" />
                  14B, Industrial Ring Road,
                  <br />
                  Textile District, Metro City 00000
                </p>
              </div>
              <div>
                <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
                  Business hours
                </h4>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li>Mon – Sat: 10:00 – 19:00 UTC</li>
                  <li>Sunday: Closed</li>
                  <li>Response time: ~4 hours</li>
                </ul>
              </div>
            </div>
            <div className="mt-12 border-t border-border/50 pt-8 text-center text-xs text-muted-foreground">
              © 2026 Kesar Textiles. This is a demo storefront mockup.
            </div>
          </div>
        </footer>

        {/* Floating WhatsApp */}
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105"
          aria-label="Chat on WhatsApp"
        >
          <MessageCircle className="h-7 w-7" />
        </a>
      </div>
    </div>
  );
}
