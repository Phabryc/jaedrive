import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { PresetRouteDetail, Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { Button, buttonVariants } from "../components/Button";
import { TripRow } from "../components/TripRow";
import { StatsBody, STATS_GRID_CLASS } from "../components/VehicleStatsPanel";
import { hasElectricData } from "../lib/vehicleCatalog";
import { useLanguage, type TranslationKey } from "../lib/i18n/LanguageContext";

const DIRECTION_FILTERS: { value: "all" | "outbound" | "return"; labelKey: TranslationKey }[] = [
  { value: "all", labelKey: "routeDetail.directionAll" },
  { value: "outbound", labelKey: "routeDetail.directionOutbound" },
  { value: "return", labelKey: "routeDetail.directionReturn" },
];

export default function RouteDetail() {
  const { t } = useLanguage();
  const { vehicleId, routeId } = useParams<{ vehicleId: string; routeId: string }>();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [detail, setDetail] = useState<PresetRouteDetail | null>(null);
  const [direction, setDirection] = useState<"outbound" | "return" | "all">("all");

  useEffect(() => {
    if (!vehicleId || !routeId) return;
    api.vehicles().then((all) => setVehicle(all.find((v) => v.id === vehicleId) ?? null));
  }, [vehicleId, routeId]);

  useEffect(() => {
    if (!vehicleId || !routeId) return;
    // Non azzerare "detail" qui: cambiare filtro direzione ricarica solo trips/stats, non
    // deve far sparire l'header (nome percorso, pulsanti modifica/elimina) - si vede il
    // contenuto precedente finche' non arriva quello nuovo, niente flash di caricamento.
    api.routeDetail(vehicleId, routeId, direction).then(setDetail);
  }, [vehicleId, routeId, direction]);

  async function handleDelete() {
    if (!vehicleId || !routeId || !detail) return;
    if (!confirm(t("routeCommon.deleteConfirm", { name: detail.route.name }))) return;
    await api.deleteRoute(vehicleId, routeId);
    navigate(`/vehicles/${vehicleId}/routes`);
  }

  if (!detail) {
    return (
      <AppShell>
        <p className="text-onsurface-variant">{t("common.loading")}</p>
      </AppShell>
    );
  }

  const { route, trips, stats } = detail;

  return (
    <AppShell>
      <Link to={`/vehicles/${vehicleId}/routes`} className="mb-4 inline-block text-sm text-onsurface-variant hover:text-onsurface">
        {t("routeDetail.backLink")}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{route.name}</h1>
          <p className="mt-1 text-sm text-onsurface-variant">{t("routeDetail.radiusLabel", { radius: route.radiusMeters.toFixed(0) })}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to={`/vehicles/${vehicleId}/routes/${routeId}/edit`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t("common.edit")}
          </Link>
          <Button variant="danger" size="sm" onClick={handleDelete}>
            {t("common.delete")}
          </Button>
        </div>
      </div>

      {route.roundTrip && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {DIRECTION_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setDirection(f.value)}
              className={`rounded-md border px-3 py-1 text-xs ${
                direction === f.value
                  ? "border-accent text-accent"
                  : "border-surface-border text-onsurface-variant hover:text-onsurface"
              }`}
            >
              {t(f.labelKey)}
              {f.value !== "all" && ` (${detail.counts[f.value]})`}
            </button>
          ))}
        </div>
      )}

      <p className="mb-4 text-sm text-onsurface-variant">
        {t(trips.length === 1 ? "routeDetail.matchOne" : "routeDetail.matchMany", {
          count: trips.length,
          radius: route.radiusMeters.toFixed(0),
        })}
      </p>

      {trips.length === 0 ? (
        <p className="text-sm text-onsurface-variant">{t("routeDetail.emptyState")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className={STATS_GRID_CLASS}>
            <StatsBody stats={stats} showElectric={hasElectricData(vehicle?.powertrain ?? null)} />
          </div>
          <div className="flex flex-col gap-2">
            {trips.map((trip) => (
              <TripRow key={trip.id} trip={trip} />
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
