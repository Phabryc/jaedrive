import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { AddressSearch } from "../components/AddressSearch";
import { RouteMapEditor, type LatLon } from "../components/RouteMapEditor";

const DEFAULT_RADIUS = 150;

// Editor mappa per un percorso preimpostato (jaedrive_todo #14) - stessa pagina per
// creazione (/vehicles/:vehicleId/routes/new, nessun routeId nei parametri) e modifica
// (/vehicles/:vehicleId/routes/:routeId/edit, precaricata). Vedi RouteMapEditor.tsx per
// l'interazione mappa (click/trascina/ricerca indirizzo) e la visualizzazione del cerchio
// di raggio.
export default function RouteEditor() {
  const { vehicleId, routeId } = useParams<{ vehicleId: string; routeId?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(routeId);

  const [loaded, setLoaded] = useState(!isEdit);
  const [name, setName] = useState("");
  const [start, setStart] = useState<LatLon | null>(null);
  const [end, setEnd] = useState<LatLon | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicleId || !routeId) return;
    api.routeDetail(vehicleId, routeId).then(({ route }) => {
      setName(route.name);
      setStart({ lat: route.startLat, lon: route.startLon });
      setEnd({ lat: route.endLat, lon: route.endLon });
      setRadiusMeters(route.radiusMeters);
      setLoaded(true);
    });
  }, [vehicleId, routeId]);

  // Il prossimo click sulla mappa imposta partenza finche' manca, poi arrivo - una volta
  // impostati entrambi i click non fanno piu' nulla (si trascina il marker per spostarlo).
  const placingMode: "start" | "end" = !start ? "start" : "end";

  async function handleSave() {
    if (!vehicleId || !name.trim() || !start || !end) return;
    setSaving(true);
    setError(null);
    try {
      if (isEdit && routeId) {
        await api.updateRoute(vehicleId, routeId, {
          name: name.trim(),
          radiusMeters,
          startLat: start.lat,
          startLon: start.lon,
          endLat: end.lat,
          endLon: end.lon,
        });
        navigate(`/vehicles/${vehicleId}/routes/${routeId}`);
      } else {
        const route = await api.createRoute(vehicleId, {
          name: name.trim(),
          startLat: start.lat,
          startLon: start.lon,
          endLat: end.lat,
          endLon: end.lon,
          radiusMeters,
        });
        navigate(`/vehicles/${vehicleId}/routes/${route.id}`);
      }
    } catch {
      setError("Impossibile salvare il percorso. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <AppShell>
        <p className="text-onsurface-variant">Caricamento...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to={isEdit ? `/vehicles/${vehicleId}/routes/${routeId}` : `/vehicles/${vehicleId}/routes`}
        className="mb-4 inline-block text-sm text-onsurface-variant hover:text-onsurface"
      >
        ← Indietro
      </Link>
      <h1 className="mb-6 text-xl font-semibold">{isEdit ? "Modifica percorso" : "Nuovo percorso"}</h1>

      <div className="mb-4">
        <label className="mb-1 block text-xs text-onsurface-variant">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="es. Casa-Lavoro"
          className="w-full rounded-md border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center justify-between text-xs text-onsurface-variant">
            <span>Partenza</span>
            {start && (
              <button onClick={() => setStart(null)} className="text-accent hover:underline">
                reimposta
              </button>
            )}
          </label>
          <AddressSearch
            placeholder="Cerca un indirizzo di partenza..."
            onSelect={(r) => {
              setStart({ lat: r.lat, lon: r.lon });
              setFocusTrigger((t) => t + 1);
            }}
          />
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between text-xs text-onsurface-variant">
            <span>Arrivo</span>
            {end && (
              <button onClick={() => setEnd(null)} className="text-accent hover:underline">
                reimposta
              </button>
            )}
          </label>
          <AddressSearch
            placeholder="Cerca un indirizzo di arrivo..."
            onSelect={(r) => {
              setEnd({ lat: r.lat, lon: r.lon });
              setFocusTrigger((t) => t + 1);
            }}
          />
        </div>
      </div>

      <p className="mb-2 text-xs text-onsurface-variant">
        {!start
          ? "Clicca sulla mappa per impostare la partenza, oppure cerca un indirizzo qui sopra."
          : !end
            ? "Clicca sulla mappa per impostare l'arrivo, oppure cerca un indirizzo qui sopra."
            : "Trascina i due marker sulla mappa per affinare la posizione."}
      </p>

      <RouteMapEditor
        start={start}
        end={end}
        radiusMeters={radiusMeters}
        onSetStart={setStart}
        onSetEnd={setEnd}
        focusTrigger={focusTrigger}
        placingMode={placingMode}
      />

      <div className="mt-4 max-w-xs">
        <label className="mb-1 block text-xs text-onsurface-variant">Raggio di tolleranza: {radiusMeters} m</label>
        <input
          type="range"
          min={30}
          max={2000}
          step={10}
          value={radiusMeters}
          onChange={(e) => setRadiusMeters(Number(e.target.value))}
          className="w-full accent-accent"
        />
      </div>

      {error && <p className="mt-4 text-sm text-bad">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !name.trim() || !start || !end}
        className="mt-6 rounded-md border border-accent px-4 py-2 text-sm text-accent disabled:opacity-50 disabled:border-surface-border disabled:text-onsurface-variant"
      >
        {saving ? "Salvataggio..." : "Salva percorso"}
      </button>
    </AppShell>
  );
}
