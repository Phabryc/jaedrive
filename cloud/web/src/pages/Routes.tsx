import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { PresetRoute, Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";

// Elenco dei percorsi preimpostati di un veicolo (jaedrive_todo #14) - creazione con
// l'editor mappa (RouteEditor.tsx, cerca indirizzo/clicca/trascina) oppure con la
// scorciatoia da un viaggio GPS gia' esistente (bottone "Salva come percorso" su
// TripDetail.tsx). Questa pagina resta solo gestione: elenco, apri per modificare, elimina.
export default function Routes() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [routes, setRoutes] = useState<PresetRoute[] | null>(null);

  function reload() {
    if (vehicleId) api.routes(vehicleId).then(setRoutes);
  }

  useEffect(() => {
    if (!vehicleId) return;
    api.vehicles().then((all) => setVehicle(all.find((v) => v.id === vehicleId) ?? null));
    reload();
  }, [vehicleId]);

  async function handleDelete(route: PresetRoute) {
    if (!vehicleId || !confirm(`Eliminare il percorso "${route.name}"? L'operazione non può essere annullata.`)) return;
    await api.deleteRoute(vehicleId, route.id);
    reload();
  }

  return (
    <AppShell>
      {vehicleId && (
        <Link to={`/vehicles/${vehicleId}/trips`} className="mb-4 inline-block text-sm text-onsurface-variant hover:text-onsurface">
          ← {vehicle?.nickname ?? "Viaggi"}
        </Link>
      )}
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Percorsi salvati</h1>
        <Link
          to={`/vehicles/${vehicleId}/routes/new`}
          className="rounded-md border border-accent px-3 py-1.5 text-sm text-accent hover:bg-accent/10"
        >
          + Nuovo percorso
        </Link>
      </div>

      {routes === null && <p className="text-onsurface-variant">Caricamento...</p>}
      {routes && routes.length === 0 && <p className="text-onsurface-variant">Nessun percorso salvato.</p>}

      <div className="flex flex-col gap-3">
        {routes?.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-4 rounded-lg border border-surface-border bg-surface p-4">
            <Link to={`/vehicles/${vehicleId}/routes/${r.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium hover:text-accent">{r.name}</p>
              <p className="mt-1 text-xs text-onsurface-variant">
                Raggio {r.radiusMeters.toFixed(0)} m · creato il {new Date(r.createdAt).toLocaleDateString("it-IT")}
              </p>
            </Link>
            <button
              onClick={() => handleDelete(r)}
              className="shrink-0 rounded-md border border-bad px-3 py-1 text-xs text-bad hover:bg-bad/10"
            >
              Elimina
            </button>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
