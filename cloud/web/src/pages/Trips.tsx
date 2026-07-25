import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { TripsPage } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { TripRow } from "../components/TripRow";
import { VehicleStatsPanel } from "../components/VehicleStatsPanel";

const KIND_FILTERS = [
  { value: "", label: "Tutti" },
  { value: "auto", label: "Percorsi GPS" },
  { value: "manual_a", label: "Trip A" },
  { value: "manual_b", label: "Trip B" },
] as const;

export default function Trips() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const [data, setData] = useState<TripsPage | null>(null);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");

  useEffect(() => {
    if (!vehicleId) return;
    setData(null);
    api.trips(vehicleId, { page, kind: kind || undefined }).then(setData);
  }, [vehicleId, page, kind]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AppShell>
      {vehicleId && <VehicleStatsPanel vehicleId={vehicleId} />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Viaggi</h1>
        <div className="flex gap-2">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setKind(f.value);
                setPage(1);
              }}
              className={`rounded-md border px-3 py-1 text-xs ${
                kind === f.value
                  ? "border-accent text-accent"
                  : "border-surface-border text-onsurface-variant hover:text-onsurface"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {data === null && <p className="text-onsurface-variant">Caricamento...</p>}
      {data && data.trips.length === 0 && (
        <p className="text-onsurface-variant">Nessun viaggio trovato.</p>
      )}

      <div className="flex flex-col gap-2">
        {data?.trips.map((t) => <TripRow key={t.id} trip={t} />)}
      </div>

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-surface-border px-3 py-1 disabled:opacity-40"
          >
            ← Precedenti
          </button>
          <span className="text-onsurface-variant">
            Pagina {page} di {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-surface-border px-3 py-1 disabled:opacity-40"
          >
            Successivi →
          </button>
        </div>
      )}
    </AppShell>
  );
}
