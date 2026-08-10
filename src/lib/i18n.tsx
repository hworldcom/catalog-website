import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useTransition,
  type ReactNode,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

export const languages = ["EN", "PL", "DE", "VI"] as const;
export type Lang = (typeof languages)[number];

export type T = Partial<Record<Lang, string>> & { EN: string };

export const t = (en: string, pl: string, de: string, vi: string): T => ({
  EN: en,
  PL: pl,
  DE: de,
  VI: vi,
});

type Ctx = { lang: Lang; setLang: (l: Lang) => void; isPending: boolean };
const LangContext = createContext<Ctx>({
  lang: "EN",
  setLang: () => {},
  isPending: false,
});

const STORAGE_KEY = "bazoria.lang";

export function normalizeLanguage(v: unknown): Lang {
  if (typeof v !== "string") return "EN";
  const up = v.toUpperCase();
  return (languages as readonly string[]).includes(up) ? (up as Lang) : "EN";
}

export function pick(dict: T | undefined | null, lang: Lang): string {
  if (!dict) return "";
  const v = dict[lang];
  if (v != null && v !== "") return v;
  if (dict.EN) return dict.EN;
  for (const l of languages) {
    const val = dict[l];
    if (val) return val;
  }
  return "";
}

let currentLang: Lang = "EN";

export function useLang() {
  return useContext(LangContext).lang;
}

export function useTr() {
  const lang = useLang();
  return useCallback((dict: T) => pick(dict, lang), [lang]);
}

/**
 * Plain function (NOT a hook). Reads the module-level current language,
 * which LangProvider keeps in sync before rendering its children. Safe
 * to use inside conditional JSX expressions without breaking hook order.
 */
export function tr(dict: T): string {
  return pick(dict, currentLang);
}

export function LangProvider({ children }: { children: ReactNode }) {
  // Root defines validateSearch with `lang`, so it's available on every route.
  const search = useSearch({ strict: false }) as { lang?: string };
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();

  const lang = normalizeLanguage(search.lang);
  currentLang = lang;

  // On first visit (no ?lang= in URL), promote the persisted choice into the URL.
  useEffect(() => {
    if (search.lang) {
      try {
        window.localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        /* ignore */
      }
      return;
    }
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const initial = normalizeLanguage(saved ?? "EN");
    if (initial !== "EN" || saved) {
      navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({ ...prev, lang: initial }),
        replace: true,
      });
    }
    // Only run once per URL change to lang; deps intentionally minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.lang]);

  const setLang = useCallback(
    (l: Lang) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, l);
      } catch {
        /* ignore */
      }
      startTransition(() => {
        navigate({
          to: ".",
          search: (prev: Record<string, unknown>) => ({ ...prev, lang: l }),
          replace: false,
        });
      });
    },
    [navigate],
  );

  const value = useMemo(() => ({ lang, setLang, isPending }), [lang, setLang, isPending]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useContext(LangContext);
  return (
    <div
      className={
        "inline-flex items-center gap-0.5 border border-border px-1 py-0.5 " + (className ?? "")
      }
      role="group"
      aria-label="Language"
    >
      {languages.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={
            "px-1.5 py-0.5 text-[11px] font-medium tracking-wide transition-colors " +
            (lang === l
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground")
          }
          aria-pressed={lang === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
