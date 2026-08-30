import { PublicContainer } from "@/components/layout/public-container";
import { t, tr } from "@/lib/i18n";

import { JoinSectionHeading } from "./join-section-heading";

const T = {
  eyebrow: t(
    "Built on trust",
    "Zbudowane na zaufaniu",
    "Auf Vertrauen gebaut",
    "Xây dựng trên sự tin cậy",
  ),
  title: t(
    "One Network. Independent Businesses.",
    "Jedna sieć. Niezależne firmy.",
    "Ein Netzwerk. Unabhängige Unternehmen.",
    "Một mạng lưới. Các doanh nghiệp độc lập.",
  ),
  sellerTitle: t(
    "Sellers stay in control",
    "Sprzedawcy zachowują kontrolę",
    "Verkäufer behalten die Kontrolle",
    "Người bán luôn giữ quyền kiểm soát",
  ),
  sellerBody: t(
    "Your identity, catalogue, branding, prices, customers and business relationships remain yours.",
    "Twoja tożsamość, katalog, marka, ceny, klienci i relacje biznesowe pozostają Twoje.",
    "Identität, Katalog, Marke, Preise, Kunden und Geschäftsbeziehungen bleiben in Ihrer Hand.",
    "Danh tính, danh mục, thương hiệu, giá cả, khách hàng và quan hệ kinh doanh vẫn thuộc về bạn.",
  ),
  buyerTitle: t(
    "Buyers gain a clearer view",
    "Kupujący zyskują lepszy przegląd",
    "Einkäufer gewinnen einen besseren Überblick",
    "Người mua có cái nhìn rõ ràng hơn",
  ),
  buyerBody: t(
    "Discover published products and suppliers in one place, then speak with the seller directly.",
    "Odkrywaj opublikowane produkty i dostawców w jednym miejscu, a następnie rozmawiaj bezpośrednio ze sprzedawcą.",
    "Entdecken Sie veröffentlichte Produkte und Lieferanten an einem Ort und sprechen Sie anschließend direkt mit dem Verkäufer.",
    "Khám phá sản phẩm và nhà cung cấp đã công bố tại một nơi, sau đó trao đổi trực tiếp với người bán.",
  ),
};

export function JoinTrustSection() {
  return (
    <section data-testid="join-trust-section">
      <PublicContainer className="py-14 sm:py-20">
        <JoinSectionHeading eyebrow={tr(T.eyebrow)} title={tr(T.title)} />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <TrustPanel
            testId="join-seller-trust-panel"
            title={tr(T.sellerTitle)}
            body={tr(T.sellerBody)}
          />
          <TrustPanel
            testId="join-buyer-trust-panel"
            title={tr(T.buyerTitle)}
            body={tr(T.buyerBody)}
          />
        </div>
      </PublicContainer>
    </section>
  );
}

function TrustPanel({ testId, title, body }: { testId: string; title: string; body: string }) {
  return (
    <article className="rounded-md border border-border bg-card p-6 sm:p-8" data-testid={testId}>
      <h3 className="break-words font-display text-xl font-semibold">{title}</h3>
      <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">{body}</p>
    </article>
  );
}
