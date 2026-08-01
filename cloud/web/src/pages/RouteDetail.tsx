import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { PresetRouteDetail, Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { TripRow } from "../components/TripRow";
import { StatsBody, STATS_GRID_CLASS } from "../components/VehicleStatsPanel";
import { hasElectricData } from "../lib/vehicleCatalog";
import { useLanguage } from "../lib/i18n/LanguageContext";

export default function RouteDetail() {
  const { t } = useLanguage();
  const { vehicleId, routeId } = useParams<{ vehicleId: string; routeId: string }>();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [detail, setDetail] = useState<PresetRouteDetail | null>(null);

  useEffect(() => {
    if (!vehicleId || !routeId) return;
    api.vehicles().then((all) => setVehicle(all.find((v) => v.id === vehicleId) ?? null));
    api.routeDetail(vehicleId, routeId).then(setDetail);
  }, [vehicleId, routeId]);

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

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{route.name}</h1>
          <p className="mt-1 text-sm text-onsurface-variant">{t("routeDetail.radiusLabel", { radius: route.radiusMeters.toFixed(0) })}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to={`/vehicles/${vehicleId}/routes/${routeId}/edit`}
            className="rounded-md border border-surface-border px-3 py-1.5 text-sm hover:border-accent"
          >
            {t("common.edit")}
          </Link>
          <button onClick={handleDelete} className="rounded-md border border-bad px-3 py-1.5 text-sm text-bad hover:bg-bad/10">
            {t("common.delete")}
          </button>
        </div>
      </div>

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
