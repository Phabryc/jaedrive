import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { api, type Profile } from "../lib/api";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"users" | "codes" | "stats">("users");

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-bold">Pannello Admin</h1>
        <div className="mb-6 flex gap-4 border-b border-surface-border pb-2">
          <button onClick={() => setActiveTab("users")} className={`font-medium ${activeTab === 'users' ? 'text-accent' : 'text-onsurface-variant'}`}>Utenti & Abbonamenti</button>
          <button onClick={() => setActiveTab("codes")} className={`font-medium ${activeTab === 'codes' ? 'text-accent' : 'text-onsurface-variant'}`}>Codici Sconto</button>
          <button onClick={() => setActiveTab("stats")} className={`font-medium ${activeTab === 'stats' ? 'text-accent' : 'text-onsurface-variant'}`}>Statistiche Sistema</button>
        </div>
        
        {activeTab === "users" && (
          <div>
            <h2 className="mb-4 text-xl">Gestione Utenti</h2>
            <p className="text-onsurface-variant">Ricerca utenti, gestione abbonamenti, swap e ruoli...</p>
            {/* Real implementation would have lists and modals here */}
          </div>
        )}

        {activeTab === "codes" && (
          <div>
            <h2 className="mb-4 text-xl">Codici Sconto</h2>
            <p className="text-onsurface-variant">Creazione e lista codici globali / ad personam...</p>
          </div>
        )}

        {activeTab === "stats" && (
          <div>
            <h2 className="mb-4 text-xl">Statistiche Sistema</h2>
            <p className="text-onsurface-variant">Metriche generali del sistema...</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
