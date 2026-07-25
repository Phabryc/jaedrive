import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { SimpleMarkdown } from "../components/SimpleMarkdown";
import jdLogo from "../assets/jd_logo.png";

import privacyIt from "../legal/privacy-policy-it.md?raw";
import privacyEn from "../legal/privacy-policy-en.md?raw";
import eulaIt from "../legal/eula-it.md?raw";
import eulaEn from "../legal/eula-en.md?raw";

const DOCS: Record<string, { it: string; en: string }> = {
  privacy: { it: privacyIt, en: privacyEn },
  eula: { it: eulaIt, en: eulaEn },
};

// Pagina pubblica (fuori da ProtectedRoute) - EULA/Privacy devono restare leggibili anche
// prima del login, non solo dopo. Toggle IT/EN locale a questa pagina soltanto: il resto
// dell'app non ha ancora un sistema di i18n (vedi jaedrive_todo).
export default function LegalDocument() {
  const { doc } = useParams<{ doc: string }>();
  const [lang, setLang] = useState<"it" | "en">("it");
  const entry = doc ? DOCS[doc] : undefined;

  return (
    <div className="min-h-screen bg-bg text-onsurface">
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/">
            <img src={jdLogo} alt="JaeDrive" className="h-7 w-auto" />
          </Link>
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setLang("it")}
              className={`rounded px-2.5 py-1 ${lang === "it" ? "bg-accent text-bg" : "text-onsurface-variant hover:text-onsurface"}`}
            >
              IT
            </button>
            <button
              onClick={() => setLang("en")}
              className={`rounded px-2.5 py-1 ${lang === "en" ? "bg-accent text-bg" : "text-onsurface-variant hover:text-onsurface"}`}
            >
              EN
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {entry ? (
          <SimpleMarkdown source={entry[lang]} />
        ) : (
          <p className="text-onsurface-variant">Documento non trovato.</p>
        )}
      </main>
    </div>
  );
}
