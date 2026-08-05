import { useState } from "react";
import { useParams } from "react-router-dom";
import { SimpleMarkdown } from "../components/SimpleMarkdown";
import { StaticHeader } from "../components/StaticHeader";

import privacyIt from "../legal/privacy-policy-it.md?raw";
import privacyEn from "../legal/privacy-policy-en.md?raw";
import eulaIt from "../legal/eula-it.md?raw";
import eulaEn from "../legal/eula-en.md?raw";

const DOCS: Record<string, { it: string; en: string }> = {
  privacy: { it: privacyIt, en: privacyEn },
  eula: { it: eulaIt, en: eulaEn },
};

export default function LegalDocument() {
  const { doc } = useParams<{ doc: string }>();
  const [lang, setLang] = useState<"it" | "en">("it");
  const entry = doc ? DOCS[doc] : undefined;

  return (
    <div className="min-h-screen bg-bg text-onsurface">
      <StaticHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between border-b border-surface-border/50 pb-4">
          <span className="text-xs text-onsurface-variant">Lingua documento / Document language:</span>
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setLang("it")}
              className={`rounded px-2.5 py-1 font-medium ${lang === "it" ? "bg-accent text-bg" : "text-onsurface-variant hover:text-onsurface bg-surface"}`}
            >
              IT
            </button>
            <button
              onClick={() => setLang("en")}
              className={`rounded px-2.5 py-1 font-medium ${lang === "en" ? "bg-accent text-bg" : "text-onsurface-variant hover:text-onsurface bg-surface"}`}
            >
              EN
            </button>
          </div>
        </div>
        {entry ? (
          <SimpleMarkdown source={entry[lang]} />
        ) : (
          <p className="text-onsurface-variant">Documento non trovato.</p>
        )}
      </main>
    </div>
  );
}
