import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { it } from "./it";
import { en } from "./en";

export type Lang = "it" | "en";
export type TranslationKey = keyof typeof it;

const DICTS: Record<Lang, Record<TranslationKey, string>> = { it, en };
const STORAGE_KEY = "jaedrive_lang";

// Stessa convenzione dell'app Android (vedi values/values-it strings.xml): italiano per chi
// ha il browser in italiano, inglese come fallback di base per tutti gli altri (l'app e'
// distribuita in tutta Europa, non solo in Italia).
function detectDefaultLang(): Lang {
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("it")) return "it";
  return "en";
}

interface LanguageState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  // Per toLocaleDateString/toLocaleTimeString - "en-GB" (non "en-US") perche' l'app e'
  // pensata per il mercato europeo, dove l'ordine giorno/mese di en-GB e' quello atteso.
  locale: string;
}

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return stored === "it" || stored === "en" ? stored : detectDefaultLang();
  });

  function setLang(l: Lang) {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // Storage non disponibile (privacy mode, quota piena) - la scelta resta valida solo
      // per questa sessione, non e' un errore da bloccare l'utente.
    }
  }

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useMemo(() => {
    return (key: TranslationKey, params?: Record<string, string | number>) => {
      let str: string = DICTS[lang][key];
      if (params) {
        // split/join invece di replaceAll: il target ES2020 di questo progetto (vedi
        // tsconfig.json) non ha ancora quel metodo.
        for (const [k, v] of Object.entries(params)) str = str.split(`{{${k}}}`).join(String(v));
      }
      return str;
    };
  }, [lang]);

  const locale = lang === "it" ? "it-IT" : "en-GB";

  return <LanguageContext.Provider value={{ lang, setLang, t, locale }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
