import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { PresetRouteDetail, Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { TripRow } from "../components/TripRow";
import { StatsBody } from "../components/VehicleStatsPanel";
import { hasElectricData } from "../lib/vehicleCatalog";

export default function RouteDetail() {
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
    if (!confirm(`Eliminare il percorso "${detail.route.name}"? L'operazione non può essere annullata.`)) return;
    await api.deleteRoute(vehicleId, routeId);
    navigate(`/vehicles/${vehicleId}/routes`);
  }

  if (!detail) {
    return (
      <AppShell>
        <p className="text-onsurface-variant">Caricamento...</p>
      </AppShell>
    );
  }

  const { route, trips, stats } = detail;

  return (
    <AppShell>
      <Link to={`/vehicles/${vehicleId}/routes`} className="mb-4 inline-block text-sm text-onsurface-variant hover:text-onsurface">
        ← Percorsi salvati
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{route.name}</h1>
          <p className="mt-1 text-sm text-onsurface-variant">Raggio di match: {route.radiusMeters.toFixed(0)} m</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to={`/vehicles/${vehicleId}/routes/${routeId}/edit`}
            className="rounded-md border border-surface-border px-3 py-1.5 text-sm hover:border-accent"
          >
            Modifica
          </Link>
          <button onClick={handleDelete} className="rounded-md border border-bad px-3 py-1.5 text-sm text-bad hover:bg-bad/10">
            Elimina
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-onsurface-variant">
        {trips.length} {trips.length === 1 ? "viaggio corrisponde" : "viaggi corrispondono"} a questo percorso (partenza e arrivo entro{" "}
        {route.radiusMeters.toFixed(0)} m).
      </p>

      {trips.length === 0 ? (
        <p className="text-sm text-onsurface-variant">
          Nessun viaggio corrisponde ancora a questo percorso. Il viaggio usato per crearlo dovrebbe comparire qui - se non lo vedi, prova
          ad allargare il raggio di match modificando il percorso.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <StatsBody stats={stats} showElectric={hasElectricData(vehicle?.powertrain ?? null)} />
          <div className="flex flex-col gap-2">
            {trips.map((t) => (
              <TripRow key={t.id} trip={t} />
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
