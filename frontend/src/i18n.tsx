import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Hafif iki dilli (TR / EN) arayüz altyapısı — harici bağımlılık yok.
 *
 * Kullanım (bileşen içinde):
 *   const { t } = useLang();
 *   <h1>{t("Cihaz Envanteri", "Device Inventory")}</h1>
 *
 * Paylaşılan etiket sözlükleri için `bi({...})` kullanılır; değerler okunduğu anda
 * aktif dile göre çözülür (CRITICALITY_LABEL[c] gibi mevcut erişim şekli korunur).
 */
export type Lang = "tr" | "en";

const STORAGE_KEY = "fg.lang";

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "tr" || stored === "en") return stored;
  } catch {
    /* localStorage erişilemez */
  }
  return "tr";
}

let currentLang: Lang = initialLang();

/** Hook dışı yardımcılar (formatDate, bi()) için aktif dil. */
export function getLang(): Lang {
  return currentLang;
}

export function getLocale(): string {
  return currentLang === "en" ? "en-GB" : "tr-TR";
}

/** Hook dışı çeviri: tr(...) / en(...) çiftinden aktif dile göre seçer. */
export function tx(tr: string, en: string): string {
  return currentLang === "en" ? en : tr;
}

/** İki dilli etiket sözlüğü: değer = [Türkçe, English]. */
export function bi<K extends string>(map: Record<K, readonly [string, string]>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(map) as K[]) {
    Object.defineProperty(out, k, {
      enumerable: true,
      get: () => (currentLang === "en" ? map[k][1] : map[k][0]),
    });
  }
  return out;
}

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);

  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* yoksay */
    }
    document.documentElement.lang = l;
    setLangState(l);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  const { lang, setLang } = ctx;
  const t = useCallback((tr: string, en: string) => (lang === "en" ? en : tr), [lang]);
  return { lang, setLang, t, locale: lang === "en" ? "en-GB" : "tr-TR" };
}
