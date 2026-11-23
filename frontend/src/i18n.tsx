import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * İki dilli (TR / EN) + Çift Temalı (Endüstriyel Koyu Komuta Modu "dark" / Açık Mühendislik Modu "light")
 * arayüz altyapısı.
 */
export type Lang = "tr" | "en";
export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "fg.lang";
const THEME_STORAGE_KEY = "fg.theme";

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "tr" || stored === "en") return stored;
  } catch {
    /* localStorage erişilemez */
  }
  return "tr";
}

function initialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* localStorage erişilemez */
  }
  return "dark";
}

let currentLang: Lang = initialLang();

export function getLang(): Lang {
  return currentLang;
}

export function getLocale(): string {
  return currentLang === "en" ? "en-GB" : "tr-TR";
}

export function tx(tr: string, en: string): string {
  return currentLang === "en" ? en : tr;
}

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
  theme: ThemeMode;
  setTheme: (m: ThemeMode) => void;
  toggleTheme: () => void;
}

const LangContext = createContext<LangContextValue | null>(null);

function applyThemeClass(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const init = initialTheme();
    applyThemeClass(init);
    return init;
  });

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

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

  const setTheme = useCallback((m: ThemeMode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, m);
    } catch {
      /* yoksay */
    }
    applyThemeClass(m);
    setThemeState(m);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ lang, setLang, theme, setTheme, toggleTheme }),
    [lang, setLang, theme, setTheme, toggleTheme],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  const { lang, setLang, theme, setTheme, toggleTheme } = ctx;
  const t = useCallback((tr: string, en: string) => (lang === "en" ? en : tr), [lang]);
  return {
    lang,
    setLang,
    theme,
    setTheme,
    toggleTheme,
    t,
    locale: lang === "en" ? "en-GB" : "tr-TR",
  };
}
