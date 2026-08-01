import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { TripsPage, Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
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
  const { t, locale } = useLanguage();
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const [data, setData] = useState<TripsPage | null>(null);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  // Periodo attivo (formato "YYYY-MM-DD", entrambi inclusi) - alimentato sia da un click
  // su un giorno del calendario in VehicleStatsPanel (che imposta rangeFrom=rangeTo, un
  // periodo di un solo giorno) sia dai due selettori data espliciti qui sotto. Un'unica
  // fonte di verita' per filtrare TANTO la lista viaggi QUANTO le statistiche aggregate
  // (VehicleStatsPanel), gia' entrambe supportate da from/to lato server.
  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);
  const isSingleDay = rangeFrom != null && rangeFrom === rangeTo;
  const fromIso = rangeFrom ? `${rangeFrom}T00:00:00.000Z` : undefined;
  const toIso = rangeTo ? `${rangeTo}T23:59:59.999Z` : undefined;
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);

  function clearRange() {
    setRangeFrom(null);
    setRangeTo(null);
    setPage(1);
  }

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
  }, [vehicleId, page, kind, isSingleDay, fromIso, toIso, refreshKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // Recupero indirizzi mancanti (vedi routes/user.ts) - i trip caricati prima del fallback
  // di geocoding lato server restano "Percorso GPS" per sempre senza questo, anche se la
  // traccia GPX ce l'hanno gia'. Un batch alla volta: se ne restano, l'utente puo' ricliccare.
  async function handleBackfillAddresses() {
    if (!vehicleId) return;
    setBackfillBusy(true);
    setBackfillStatus(null);
    try {
      const res = await api.backfillAddresses(vehicleId);
      if (res.scanned === 0) {
        setBackfillStatus(t("trips.backfillAllPresent"));
      } else {
        setBackfillStatus(
          t("trips.backfillResult", { updated: res.updated, scanned: res.scanned }) +
            (res.remaining > 0 ? t("trips.backfillContinue") : ""),
        );
      }
      setRefreshKey((k) => k + 1);
    } catch {
      setBackfillStatus(t("trips.backfillError"));
    } finally {
      setBackfillBusy(false);
    }
  }

  function formatDayLabel(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  }

  return (
    <AppShell>
      {vehicle && <VehicleInfoCard vehicle={vehicle} />}

      {vehicleId && (
        <VehicleStatsPanel
          vehicleId={vehicleId}
          powertrain={vehicle?.powertrain ?? null}
          from={fromIso}
          to={toIso}
          selectedDate={isSingleDay ? rangeFrom : null}
          onSelectDate={(d) => {
            setRangeFrom(d);
            setRangeTo(d);
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
          {isSingleDay && rangeFrom && (
            <button
              onClick={clearRange}
              className="flex items-center gap-1.5 rounded-md border border-accent px-3 py-1 text-xs text-accent"
            >
              {formatDayLabel(rangeFrom)}
              <span aria-hidden>✕</span>
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-onsurface-variant">{t("trips.rangeLabel")}</span>
        <input
          type="date"
          aria-label={t("trips.rangeFrom")}
          value={rangeFrom ?? ""}
          max={rangeTo ?? undefined}
          onChange={(e) => {
            setRangeFrom(e.target.value || null);
            setPage(1);
          }}
          className="rounded-md border border-surface-border bg-bg px-2 py-1 text-onsurface outline-none focus:border-accent"
        />
        <span className="text-onsurface-variant" aria-hidden>
          →
        </span>
        <input
          type="date"
          aria-label={t("trips.rangeTo")}
          value={rangeTo ?? ""}
          min={rangeFrom ?? undefined}
          onChange={(e) => {
            setRangeTo(e.target.value || null);
            setPage(1);
          }}
          className="rounded-md border border-surface-border bg-bg px-2 py-1 text-onsurface outline-none focus:border-accent"
        />
        {(rangeFrom || rangeTo) && (
          <button
            onClick={clearRange}
            className="rounded-md border border-surface-border px-2 py-1 text-onsurface-variant hover:border-accent hover:text-onsurface"
            title={t("trips.rangeClear")}
          >
            ✕
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        <button
          onClick={handleBackfillAddresses}
          disabled={backfillBusy}
          className="rounded-md border border-surface-border px-3 py-1 text-onsurface-variant hover:border-accent hover:text-onsurface disabled:opacity-50"
        >
          {backfillBusy ? t("trips.backfillBusy") : t("trips.backfillButton")}
        </button>
        {backfillStatus && <span className="text-onsurface-variant">{backfillStatus}</span>}
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
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-surface-border px-3 py-1 disabled:opacity-40"
          >
            {t("trips.prevPage")}
          </button>
          <span className="text-onsurface-variant">{t("trips.pageOf", { page, total: totalPages })}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-surface-border px-3 py-1 disabled:opacity-40"
          >
            {t("trips.nextPage")}
          </button>
        </div>
      )}
    </AppShell>
  );
}
