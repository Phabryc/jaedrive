import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { TripDetail as TripDetailType, TripSummary, Vehicle, VehicleStats } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/Button";
import { TripMap } from "../components/TripMap";
import { TripRow } from "../components/TripRow";
import { StatsBody, STATS_GRID_CLASS } from "../components/VehicleStatsPanel";
import { BUCKET_COLOR, BUCKET_LABEL } from "../lib/energyFlow";
import { parseGpxPoints, cumulativeDistanceKm } from "../lib/gpx";
import { BatteryFuelChart, SpeedChart, ElevationChart } from "../components/TripTimelineCharts";
import { ExperimentalTripCharts } from "../components/ExperimentalTripCharts";
import { CategoryBand } from "../components/CategoryBand";
import { DRIVE_MODE_COLOR, DRIVE_MODE_LABEL } from "../lib/driveMode";
import { IconLocationPin, IconFlagCheckered, IconRoute, IconFuel, IconGauge } from "../components/icons";
import { hasElectricData } from "../lib/vehicleCatalog";
import { useLanguage, type TranslationKey } from "../lib/i18n/LanguageContext";
import { useUnits } from "../lib/UnitsContext";
import { formatDistance, formatConsumption, toDisplayDistance } from "../lib/units";

const KIND_LABEL_KEY: Record<TripDetailType["kind"], TranslationKey> = {
  auto: "trip.kindAuto",
  manual: "trip.kindManual",
};

export default function TripDetail() {
  const { t, locale } = useLanguage();
  const { distanceUnit, consumptionFormat } = useUnits();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetailType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Salvataggio come percorso preimpostato (jaedrive_todo #14) - solo per trip AUTO con
  // traccia GPX, vedi routes/user.ts POST .../routes (usa questo trip come "modello" per
  // le coordinate di partenza/arrivo).
  const [showSaveRoute, setShowSaveRoute] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [savingRoute, setSavingRoute] = useState(false);
  const [savedRoute, setSavedRoute] = useState<{ id: string } | null>(null);
  const [saveRouteError, setSaveRouteError] = useState<string | null>(null);

  // Viaggi AUTO confluiti in questo accumulo manuale + statistiche aggregate (jaedrive_todo
  // #15) - solo per trip "manual".
  const [manualRangeTrips, setManualRangeTrips] = useState<TripSummary[] | null>(null);
  const [manualRangeStats, setManualRangeStats] = useState<VehicleStats | null>(null);

  useEffect(() => {
    if (id) api.trip(id).then(setTrip);
  }, [id]);

  useEffect(() => {
    // Nessun GET singolo /vehicles/:id lato server - la lista e' piccola per un uso
    // personale, va bene filtrarla qui (stesso pattern gia' usato in Trips.tsx).
    if (trip) api.vehicles().then((all) => setVehicle(all.find((v) => v.id === trip.vehicleId) ?? null));
  }, [trip?.vehicleId]);

  useEffect(() => {
    if (!trip || trip.kind !== "manual") return;
    const from = trip.startedAt;
    const to = trip.endedAt ?? new Date().toISOString();
    setManualRangeTrips(null);
    setManualRangeStats(null);
    Promise.all([
      fetchAllTrips(trip.vehicleId, { kind: "auto", from, to }),
      api.stats(trip.vehicleId, { kind: "auto", from, to }),
    ]).then(([trips, stats]) => {
      setManualRangeTrips(trips);
      setManualRangeStats(stats);
    });
  }, [trip?.id, trip?.kind, trip?.startedAt, trip?.endedAt]);

  // Calcolati sempre (regole degli hook: mai dopo un return condizionale) - vuoti finche'
  // il trip non e' ancora caricato o non ha una traccia GPX (es. viaggio manuale).
  const points = useMemo(() => (trip?.gpxRaw ? parseGpxPoints(trip.gpxRaw) : []), [trip?.gpxRaw]);
  const distancesKm = useMemo(() => cumulativeDistanceKm(points), [points]);
  // Convertita una sola volta qui (unico punto che conosce l'unita' scelta) e passata gia'
  // pronta a tutti i grafici sotto: le loro proporzioni/segmenti restano corretti qualunque
  // sia l'unita' (scala lineare), serve solo per gli assi/tooltip - vedi CategoryBand.tsx.
  const distances = useMemo(() => distancesKm.map((km) => toDisplayDistance(km, distanceUnit)), [distancesKm, distanceUnit]);

  async function handleDelete() {
    if (!trip || !confirm(t("tripDetail.deleteConfirm"))) return;
    setDeleting(true);
    await api.deleteTrip(trip.id);
    navigate(-1);
  }

  async function handleSaveRoute() {
    if (!trip) return;
    const name = routeName.trim();
    if (!name) return;
    setSavingRoute(true);
    setSaveRouteError(null);
    try {
      const route = await api.createRoute(trip.vehicleId, { name, sourceTripId: trip.id });
      setSavedRoute(route);
      setShowSaveRoute(false);
    } catch {
      setSaveRouteError(t("routeCommon.saveError"));
    } finally {
      setSavingRoute(false);
    }
  }

  if (!trip) {
    return (
      <AppShell>
        <p className="text-onsurface-variant">{t("common.loading")}</p>
      </AppShell>
    );
  }

  const breakdown = [
    { key: "EV", value: trip.pctEv },
    { key: "SERIES", value: trip.pctSeries },
    { key: "PARALLEL", value: trip.pctParallel },
    { key: "CHR", value: trip.pctOther },
  ] as const;
  const hasBreakdown = breakdown.some((b) => b.value != null && b.value > 0);

  return (
    <AppShell>
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-onsurface-variant hover:text-onsurface">
        {t("common.back")}
      </button>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {trip.startLabel || trip.label ? (
            <div className="flex flex-col gap-1">
              {trip.startLabel && (
                <h1 className="flex items-center gap-2 truncate text-lg font-semibold">
                  <IconLocationPin size={18} className="shrink-0 text-accent" />
                  <span className="truncate">{trip.startLabel}</span>
                </h1>
              )}
              {trip.label && (
                <h1 className="flex items-center gap-2 truncate text-lg font-semibold">
                  <span className="shrink-0"><IconFlagCheckered size={18} /></span>
                  <span className="truncate">{trip.label}</span>
                </h1>
              )}
            </div>
          ) : (
            <h1 className="text-xl font-semibold">{t(KIND_LABEL_KEY[trip.kind])}</h1>
          )}
          <p className="mt-1 text-sm text-onsurface-variant">
            {t(KIND_LABEL_KEY[trip.kind])} · {new Date(trip.startedAt).toLocaleString(locale)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {trip.kind === "auto" && trip.gpxRaw && !savedRoute && (
            <Button variant="secondary" size="sm" onClick={() => setShowSaveRoute((s) => !s)}>
              {t("tripDetail.saveAsRoute")}
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
            {t("common.delete")}
          </Button>
        </div>
      </div>

      {showSaveRoute && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-surface-border bg-surface p-4 sm:flex-row sm:items-center">
          <input
            autoFocus
            placeholder={t("tripDetail.routeNamePlaceholder")}
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveRoute()}
            className="flex-1 rounded-md border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <Button variant="primary" size="sm" onClick={handleSaveRoute} disabled={savingRoute || !routeName.trim()}>
            {savingRoute ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      )}
      {saveRouteError && <p className="mb-4 text-sm text-bad">{saveRouteError}</p>}
      {savedRoute && (
        <p className="mb-4 text-sm text-good">
          {t("tripDetail.routeSaved")}{" "}
          <Link to={`/vehicles/${trip.vehicleId}/routes/${savedRoute.id}`} className="underline hover:text-onsurface">
            {t("tripDetail.viewRoute")}
          </Link>
        </p>
      )}

      {trip.gpxRaw && (
        <TripMap
          gpxRaw={trip.gpxRaw}
          points={points}
          distances={distances}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
        />
      )}

      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-3">
        <Stat icon={<IconRoute size={18} />} label={t("trip.kmTraveled")} value={trip.km != null ? formatDistance(trip.km, distanceUnit) : "–"} />
        <Stat icon={<IconFuel size={18} />} label={t("trip.liters")} value={trip.liters != null ? trip.liters.toFixed(2) : "–"} />
        <Stat
          icon={<IconGauge size={18} />}
          label={t("trip.avgConsumption")}
          value={trip.avgConsumption != null ? formatConsumption(trip.avgConsumption, distanceUnit, consumptionFormat) : "–"}
        />
      </div>

      {hasBreakdown && (
        <div className="mt-4 flex items-stretch rounded-lg border border-surface-border bg-surface p-4">
          {breakdown.map((b, i) => (
            <div key={b.key} className="flex flex-1 items-center">
              <div className="flex flex-1 flex-col items-center gap-2 py-1">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: BUCKET_COLOR[b.key] }} />
                <span className="text-lg font-bold tabular-nums">{(b.value ?? 0).toFixed(0)}%</span>
                <span className="text-sm text-onsurface-variant">{BUCKET_LABEL[b.key]}</span>
              </div>
              {i < breakdown.length - 1 && <div className="h-14 w-px bg-surface-border" />}
            </div>
          ))}
        </div>
      )}
      {hasBreakdown && trip.kind === "manual" && (
        <p className="mt-2 text-xs text-onsurface-variant">{t("tripDetail.manualBreakdownNote")}</p>
      )}

      {points.length > 1 && (
        <div className="mt-4 flex flex-col gap-4">
          <CategoryBand
            title={t("tripDetail.driveModeTitle")}
            distances={distances}
            unit={distanceUnit}
            values={points.map((p) => (p.driveMode != null ? (String(p.driveMode) as "0" | "1" | "2") : null))}
            colorMap={DRIVE_MODE_COLOR}
            labelMap={DRIVE_MODE_LABEL}
          />
          <BatteryFuelChart points={points} distances={distances} unit={distanceUnit} onHighlightIndex={setSelectedIndex} />
          <SpeedChart points={points} distances={distances} unit={distanceUnit} onHighlightIndex={setSelectedIndex} />
          <ElevationChart points={points} distances={distances} unit={distanceUnit} onHighlightIndex={setSelectedIndex} />
          <ExperimentalTripCharts points={points} distances={distances} unit={distanceUnit} />
        </div>
      )}

      {trip.kind === "manual" && (
        <div className="mt-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("tripDetail.manualRangeTitle")}</h2>
          {manualRangeTrips === null && <p className="text-sm text-onsurface-variant">{t("common.loading")}</p>}
          {manualRangeTrips && manualRangeTrips.length === 0 && (
            <p className="text-sm text-onsurface-variant">{t("tripDetail.manualRangeEmpty")}</p>
          )}
          {manualRangeStats && manualRangeTrips && manualRangeTrips.length > 0 && (
            <>
              <div className={STATS_GRID_CLASS}>
                <StatsBody stats={manualRangeStats} showElectric={hasElectricData(vehicle?.powertrain ?? null)} />
              </div>
              <div className="flex flex-col gap-2">
                {manualRangeTrips.map((rangeTrip) => (
                  <TripRow key={rangeTrip.id} trip={rangeTrip} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-surface-border bg-surface p-4 text-center">
      <span className="text-onsurface-variant">{icon}</span>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-onsurface-variant">{label}</p>
    </div>
  );
}

// Il trip manuale puo' facilmente coprire piu' di una pagina di /vehicles/:id/trips (20
// risultati) se e' rimasto aperto per settimane - qui serve l'elenco COMPLETO (non solo la
// prima pagina) per l'aggregazione e la lista cliccabile, quindi si scorrono tutte le
// pagine invece di esporre un nuovo parametro "no limit" lato server.
async function fetchAllTrips(
  vehicleId: string,
  params: { kind?: string; from?: string; to?: string },
): Promise<TripSummary[]> {
  const all: TripSummary[] = [];
  let page = 1;
  for (;;) {
    const res = await api.trips(vehicleId, { ...params, page });
    all.push(...res.trips);
    if (all.length >= res.total || res.trips.length === 0) break;
    page++;
  }
  return all;
}
