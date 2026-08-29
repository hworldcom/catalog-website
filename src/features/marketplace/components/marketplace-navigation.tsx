import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { PublicContainer } from "@/components/layout/public-container";
import { t, tr, useLang } from "@/lib/i18n";

import { PUBLIC_AUDIENCES, type PublicAudience } from "../public-audience";
import { getPublicCategoryLabel } from "../public-category-labels";
import { audienceNavigationQueryOptions } from "../queries";
import { getSellerInitial } from "../seller-storefront";

const N = {
  navigation: t(
    "Marketplace navigation",
    "Nawigacja marketplace",
    "Marktplatz-Navigation",
    "Điều hướng chợ",
  ),
  audience: t("Shop for", "Kupuj dla", "Einkaufen für", "Mua sắm cho"),
  all: t("All", "Wszystko", "Alle", "Tất cả"),
  women: t("Women", "Kobiety", "Damen", "Nữ"),
  men: t("Men", "Mężczyźni", "Herren", "Nam"),
  kids: t("Kids", "Dzieci", "Kinder", "Trẻ em"),
  clothing: t("Clothing", "Odzież", "Bekleidung", "Quần áo"),
  sellers: t("Sellers", "Sprzedawcy", "Verkäufer", "Nhà bán"),
  joinUs: t("Join Us", "Dołącz do nas", "Mitmachen", "Tham gia cùng chúng tôi"),
  clothingEmpty: t(
    "No clothing categories are available for this audience yet.",
    "Brak kategorii odzieży dla tej grupy.",
    "Für diese Zielgruppe sind noch keine Bekleidungskategorien verfügbar.",
    "Chưa có danh mục quần áo cho nhóm này.",
  ),
  sellersEmpty: t(
    "No sellers are available for this audience yet.",
    "Brak sprzedawców dla tej grupy.",
    "Für diese Zielgruppe sind noch keine Verkäufer verfügbar.",
    "Chưa có nhà bán cho nhóm này.",
  ),
};

const audienceLabels = {
  all: N.all,
  women: N.women,
  men: N.men,
  kids: N.kids,
} as const;

type PanelName = "clothing" | "sellers";

export function MarketplaceNavigation({ audience }: { audience: PublicAudience }) {
  const language = useLang();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(audienceNavigationQueryOptions(audience));
  const [openPanel, setOpenPanel] = useState<PanelName | null>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pointerToggleRef = useRef<{
    panel: PanelName;
    pointerType: string;
    wasOpen: boolean;
  } | null>(null);
  const clothingTriggerId = `marketplace-clothing-trigger-${useId()}`;
  const sellersTriggerId = `marketplace-sellers-trigger-${useId()}`;
  const clothingPanelId = `marketplace-clothing-panel-${useId()}`;
  const sellersPanelId = `marketplace-sellers-panel-${useId()}`;

  useEffect(() => {
    if (!openPanel) return;

    const closeOutside = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) setOpenPanel(null);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      activeTriggerRef.current?.focus();
      setOpenPanel(null);
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [openPanel]);

  const openFromTrigger = (panel: PanelName, trigger: HTMLButtonElement) => {
    activeTriggerRef.current = trigger;
    setOpenPanel(panel);
  };

  const handleTriggerPointerDown = (
    panel: PanelName,
    trigger: HTMLButtonElement,
    pointerType: string,
  ) => {
    activeTriggerRef.current = trigger;
    pointerToggleRef.current = { panel, pointerType, wasOpen: openPanel === panel };
  };

  const handleTriggerClick = (panel: PanelName, trigger: HTMLButtonElement) => {
    activeTriggerRef.current = trigger;
    const pointerToggle = pointerToggleRef.current;
    pointerToggleRef.current = null;
    if (pointerToggle?.panel === panel) {
      if (pointerToggle.pointerType === "mouse") {
        setOpenPanel(panel);
        return;
      }
      setOpenPanel(pointerToggle.wasOpen ? null : panel);
      return;
    }
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  const changeAudience = (nextAudience: PublicAudience) => {
    if (nextAudience === audience) return;
    setOpenPanel(null);
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        audience: nextAudience,
      }),
    });
  };

  return (
    <nav
      ref={navigationRef}
      aria-label={tr(N.navigation)}
      className="relative bg-card"
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setOpenPanel(null);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpenPanel(null);
        }
      }}
    >
      <div className="border-b border-border bg-background">
        <PublicContainer>
          <div
            data-testid="marketplace-audience-row"
            className="flex min-h-12 min-w-0 items-center gap-2"
          >
            <div
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
              role="group"
              aria-label={tr(N.audience)}
            >
              {PUBLIC_AUDIENCES.map((item) => {
                const selected = item === audience;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => changeAudience(item)}
                    className={
                      "min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
                      (selected
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground")
                    }
                    aria-pressed={selected}
                  >
                    {tr(audienceLabels[item])}
                  </button>
                );
              })}
            </div>
            <Link
              to="/join"
              search={(previous) => ({ ...previous, audience })}
              onFocus={() => setOpenPanel(null)}
              onPointerEnter={() => setOpenPanel(null)}
              onClick={() => setOpenPanel(null)}
              className="inline-flex min-h-11 shrink-0 items-center justify-center border border-primary px-3 text-sm font-medium text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 data-[status=active]:bg-accent data-[status=active]:text-accent-foreground"
            >
              {tr(N.joinUs)}
            </Link>
          </div>
        </PublicContainer>
      </div>

      <div className="relative border-b border-border bg-card">
        <PublicContainer className="relative">
          <div
            data-testid="marketplace-section-row"
            className="grid min-h-12 grid-cols-2 gap-2 py-1 lg:flex lg:items-center lg:justify-start lg:gap-0 lg:py-0"
            aria-label={tr(N.navigation)}
          >
            <NavigationTrigger
              id={clothingTriggerId}
              controls={clothingPanelId}
              expanded={openPanel === "clothing"}
              label={tr(N.clothing)}
              onFocus={(trigger) => openFromTrigger("clothing", trigger)}
              onPointerEnter={(trigger) => openFromTrigger("clothing", trigger)}
              onPointerDown={(trigger, pointerType) =>
                handleTriggerPointerDown("clothing", trigger, pointerType)
              }
              onClick={(trigger) => handleTriggerClick("clothing", trigger)}
            />
            <NavigationTrigger
              id={sellersTriggerId}
              controls={sellersPanelId}
              expanded={openPanel === "sellers"}
              label={tr(N.sellers)}
              onFocus={(trigger) => openFromTrigger("sellers", trigger)}
              onPointerEnter={(trigger) => openFromTrigger("sellers", trigger)}
              onPointerDown={(trigger, pointerType) =>
                handleTriggerPointerDown("sellers", trigger, pointerType)
              }
              onClick={(trigger) => handleTriggerClick("sellers", trigger)}
            />
          </div>

          {openPanel === "clothing" ? (
            <div
              id={clothingPanelId}
              role="region"
              aria-labelledby={clothingTriggerId}
              className="border-t border-border bg-card p-4 shadow-xl lg:absolute lg:left-8 lg:right-8 lg:top-full lg:z-50 lg:border"
            >
              {data.categories.length === 0 ? (
                <NavigationEmptyState>{tr(N.clothingEmpty)}</NavigationEmptyState>
              ) : (
                <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {data.categories.map((category) => (
                    <Link
                      key={category.id}
                      to="/c/$category"
                      params={{ category: category.slug }}
                      search={(previous) => ({ ...previous, audience })}
                      onClick={() => setOpenPanel(null)}
                      className="min-h-11 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {getPublicCategoryLabel(category.slug, category.name, language)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {openPanel === "sellers" ? (
            <div
              id={sellersPanelId}
              role="region"
              aria-labelledby={sellersTriggerId}
              className="border-t border-border bg-card p-4 shadow-xl lg:absolute lg:left-8 lg:right-8 lg:top-full lg:z-50 lg:border"
            >
              {data.sellers.length === 0 ? (
                <NavigationEmptyState>{tr(N.sellersEmpty)}</NavigationEmptyState>
              ) : (
                <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
                  {data.sellers.map((seller) => (
                    <Link
                      key={seller.id}
                      to="/s/$sellerSlug"
                      params={{ sellerSlug: seller.slug }}
                      search={(previous) => ({ ...previous, audience })}
                      onClick={() => setOpenPanel(null)}
                      className="flex min-h-14 items-center gap-3 border border-border/60 p-2 transition-colors hover:border-primary/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <SellerNavigationLogo name={seller.name} logoUrl={seller.logoUrl} />
                      <span className="min-w-0 truncate text-sm font-medium">{seller.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </PublicContainer>
      </div>
    </nav>
  );
}

function NavigationTrigger({
  id,
  controls,
  expanded,
  label,
  onFocus,
  onPointerEnter,
  onPointerDown,
  onClick,
}: {
  id: string;
  controls: string;
  expanded: boolean;
  label: string;
  onFocus: (trigger: HTMLButtonElement) => void;
  onPointerEnter: (trigger: HTMLButtonElement) => void;
  onPointerDown: (trigger: HTMLButtonElement, pointerType: string) => void;
  onClick: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onFocus={(event) => onFocus(event.currentTarget)}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") onPointerEnter(event.currentTarget);
      }}
      onPointerDown={(event) => onPointerDown(event.currentTarget, event.pointerType)}
      onClick={(event) => onClick(event.currentTarget)}
      className="inline-flex min-h-11 items-center justify-between gap-2 border border-border/60 px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:border-transparent"
    >
      {label}
      <ChevronDown
        className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
        aria-hidden
      />
    </button>
  );
}

function NavigationEmptyState({ children }: { children: string }) {
  return (
    <p className="border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function SellerNavigationLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!logoUrl || failed) {
    return (
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center border border-primary/40 bg-primary/10 font-display font-semibold text-primary"
      >
        {getSellerInitial(name)}
      </span>
    );
  }

  return (
    <img
      src={logoUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 border border-border/60 bg-background object-contain"
    />
  );
}
