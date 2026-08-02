import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { TripsPage, Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/Button";
import { TripRow } from "../components/TripRow";
import { VehicleStatsPanel } from "../components/VehicleStatsPanel";
import { VehicleInfoCard } from "../components/VehicleInfoCard";
import { useLanguage, type TranslationKey } from "../lib/i18n/LanguageContext";

const KIND_FILTERS: { value: string; labelKey: TranslationKey }[] = [
  { value: "", labelKey: "trips.filterAll" },
  { value: "auto", labelKey: "trips.filterAuto" },
  { value: "manual", labelKey: "trips.filterManual" },
];

export default function Trips() {
  const { t } = useLanguage();
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const [data, setData] = useState<TripsPage | null>(null);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  // Periodo attivo (formato "YYYY-MM-DD", entrambi inclusi) - scelto interamente dal
  // calendario dentro VehicleStatsPanel (click singolo, o modalita' "Periodo" per un
  // intervallo - vedi CalendarHeatmap), non da controlli separati qui. Un'unica fonte di
  // verita' per filtrare TANTO la lista viaggi QUANTO le statistiche aggregate, gia'
  // entrambe supportate da from/to lato server.
  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);
  const isSingleDay = rangeFrom != null && rangeFrom === rangeTo;
  const fromIso = rangeFrom ? `${rangeFrom}T00:00:00.000Z` : undefined;
  const toIso = rangeTo ? `${rangeTo}T23:59:59.999Z` : undefined;
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
        // Un singolo giorno (click sul calendario) forza sempre "solo percorsi GPS": i
        // trip manuali sono accumulatori che possono restare aperti per giorni/settimane,
        // non hanno un vero "quel giorno" - il calendario stesso li esclude gia'
        // dall'aggregazione (vedi /stats/calendar). Un periodo piu' ampio scelto a mano
        // invece rispetta il filtro tipo scelto dall'utente, entrambi i kind restano validi.
        kind: isSingleDay ? "auto" : kind || undefined,
        from: fromIso,
        to: toIso,
      })
      .then(setData);
  }, [vehicleId, page, kind, isSingleDay, fromIso, toIso]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AppShell>
      {vehicle && <VehicleInfoCard vehicle={vehicle} />}

      {vehicleId && (
        <VehicleStatsPanel
          vehicleId={vehicleId}
          powertrain={vehicle?.powertrain ?? null}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          onRangeChange={(from, to) => {
            setRangeFrom(from);
            setRangeTo(to);
            setPage(1);
          }}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{t("trips.title")}</h1>
          {vehicleId && (
            <Link to={`/vehicles/${vehicleId}/routes`} className="text-sm text-onsurface-variant hover:text-onsurface hover:underline">
              {t("trips.savedRoutesLink")}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {data === null && <p className="text-onsurface-variant">{t("common.loading")}</p>}
      {data && data.trips.length === 0 && (
        <p className="text-onsurface-variant">{t("trips.noTrips")}</p>
      )}

      <div className="flex flex-col gap-2">
        {data?.trips.map((trip) => <TripRow key={trip.id} trip={trip} />)}
      </div>

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("trips.prevPage")}
          </Button>
          <span className="text-onsurface-variant">{t("trips.pageOf", { page, total: totalPages })}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {t("trips.nextPage")}
          </Button>
        </div>
      )}
    </AppShell>
  );
}
