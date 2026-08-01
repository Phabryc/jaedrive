import { useEffect, useState, type ReactNode } from "react";

// Preferenza di apertura/chiusura per card identificata da `id`, ricordata tra una visita e
// l'altra (localStorage, non serve un giro server per qualcosa di puramente estetico/per-
// dispositivo). Namespace col prefisso per non entrare in conflitto con altre chiavi gia'
// usate altrove nel sito (es. lingua, tema).
const STORAGE_PREFIX = "jaedrive.cardCollapsed.";

function readStored(id: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + id) === "1";
  } catch {
    return false; // storage non disponibile (privacy mode/quota) - si parte sempre aperti
  }
}

// Card standard del sito (bordo + titolo) con corpo collassabile - estratta perche' lo
// stesso identico blocco "rounded-lg border ... <p>titolo</p> ... contenuto" era gia'
// duplicato in VehicleStatsPanel (grafico trend, i due donut) e CalendarHeatmap: qui diventa
// il primitivo condiviso, non solo un wrapper aggiunto sopra.
export function Collapsible({
  id,
  title,
  headerExtra,
  children,
}: {
  id: string;
  title: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => readStored(id));

  useEffect(() => {
    try {
      if (collapsed) localStorage.setItem(STORAGE_PREFIX + id, "1");
      else localStorage.removeItem(STORAGE_PREFIX + id);
    } catch {
      // Preferenza semplicemente non sopravvive al refresh - non e' un dato critico.
    }
  }, [id, collapsed]);

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <div className={`flex items-center justify-between gap-3 ${collapsed ? "" : "mb-3"}`}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className={`shrink-0 text-onsurface-variant transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="truncate">{title}</span>
        </button>
        {headerExtra}
      </div>
      {!collapsed && children}
    </div>
  );
}
