import { useLanguage, type Lang } from "../lib/i18n/LanguageContext";

// Stesso pattern a pillola gia' usato dal toggle IT/EN locale di LegalDocument.tsx (li'
// resta locale a quella pagina apposta, vedi il suo commento) - qui invece pilota la lingua
// globale dell'intera app via LanguageContext, l'equivalente web del toggle IT/EN gia'
// presente nell'app Android.
const LANGS: { value: Lang; label: string }[] = [
  { value: "it", label: "IT" },
  { value: "en", label: "EN" },
];

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLanguage();
  return (
    <div className={`flex gap-1 text-xs ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l.value}
          onClick={() => setLang(l.value)}
          className={`rounded px-2.5 py-1 ${
            lang === l.value ? "bg-accent text-bg" : "text-onsurface-variant hover:text-onsurface"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
