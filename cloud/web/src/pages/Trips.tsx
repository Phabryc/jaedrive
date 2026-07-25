import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { TripsPage, Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { TripRow } from "../components/TripRow";
import { VehicleStatsPanel } from "../components/VehicleStatsPanel";
import { VehicleInfoCard } from "../components/VehicleInfoCard";

const KIND_FILTERS = [
  { value: "", label: "Tutti" },
  { value: "auto", label: "Percorsi GPS" },
  { value: "manual", label: "Viaggi manuali" },
] as const;

export default function Trips() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const [data, setData] = useState<TripsPage | null>(null);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  // Giorno selezionato dal calendario in VehicleStatsPanel (formato "YYYY-MM-DD") - filtra
  // la lista qui sotto tramite from/to, gia' supportati da /vehicles/:id/trips.
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (!vehicleId) return;
    // Nessun GET singolo /vehicles/:id lato server - la lista e' piccola per un uso
    // personale, va bene filtrarla qui invece di aggiungere una rotta solo per questo.
    api.vehicles().then((all) => setVehicle(all.find((v) => v.id === vehicleId) ?? null));
  }, [vehicleId]);

  useEffect(() => {
    if (!vehicleId) return;
    setData(null);
    api
      .trips(vehicleId, {
        page,
        // Un giorno selezionato forza sempre "solo percorsi GPS": i trip manuali sono
        // accumulatori che possono restare aperti per giorni/settimane, non hanno un vero
        // "quel giorno" - il calendario stesso li esclude gia' dall'aggregazione (vedi
        // /stats/calendar), la lista deve restare coerente con quello che mostra.
        kind: dayFilter ? "auto" : kind || undefined,
        from: dayFilter ? `${dayFilter}T00:00:00.000Z` : undefined,
        to: dayFilter ? `${dayFilter}T23:59:59.999Z` : undefined,
      })
      .then(setData);
  }, [vehicleId, page, kind, dayFilter]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AppShell>
      {vehicle && <VehicleInfoCard vehicle={vehicle} />}

      {vehicleId && (
        <VehicleStatsPanel
          vehicleId={vehicleId}
          selectedDate={dayFilter}
          onSelectDate={(d) => {
            setDayFilter(d);
            setPage(1);
          }}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Viaggi</h1>
        <div className="flex flex-wrap items-center gap-2">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setKind(f.value);
                setDayFilter(null); // un giorno selezionato forza "auto" - cambiare tipo lo svuota
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
          {dayFilter && (
            <button
              onClick={() => setDayFilter(null)}
              className="flex items-center gap-1.5 rounded-md border border-accent px-3 py-1 text-xs text-accent"
            >
              {formatDayLabel(dayFilter)}
              <span aria-hidden>✕</span>
            </button>
          )}
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

function formatDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
