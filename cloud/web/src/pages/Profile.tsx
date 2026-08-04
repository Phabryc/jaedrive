import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useProfile } from "../lib/ProfileContext";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { Button } from "../components/Button";

export default function Profile() {
  const { profile } = useProfile();
  const { t } = useLanguage();

  if (!profile) return <AppShell><p>Caricamento...</p></AppShell>;

  const sub = profile.subscription;
  const badgeLabel = sub?.status === "PREMIUM" ? `PREMIUM ${sub.tier}` : "FREE";

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold">Profilo</h1>
        
        <section className="mb-8 rounded-lg border border-surface-border bg-surface p-4">
          <h2 className="mb-4 text-lg font-medium">Abbonamento e Garage</h2>
          <div className="mb-4 flex items-center gap-2">
            <span className={`rounded px-2 py-1 text-xs font-bold ${sub?.status === 'PREMIUM' ? 'bg-accent text-white' : 'bg-surface-border'}`}>
              {badgeLabel}
            </span>
            {sub?.expiresAt && (
              <span className="text-sm text-onsurface-variant">
                Scade il: {new Date(sub.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="mb-2">
            <p className="text-sm">Veicoli attivi: <strong>{sub?.activeVehicles} di {sub?.maxVehicles}</strong></p>
          </div>
          <div className="mb-4">
            <p className="text-sm">Cambio headunit: <strong>{sub?.headunitSwaps} di {sub?.maxHeadunitSwaps} usati negli ultimi 365 giorni</strong></p>
            <p className="text-xs text-onsurface-variant mt-1">
              Nota: il ri-accoppiamento di dispositivi già esistenti non consuma swap aggiuntivi.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
