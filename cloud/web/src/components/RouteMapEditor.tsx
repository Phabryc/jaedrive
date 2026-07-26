import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";
import { START_ICON, END_ICON } from "../lib/mapIcons";

export interface LatLon {
  lat: number;
  lon: number;
}

// Centro di default quando ne' partenza ne' arrivo sono ancora impostati (creazione di un
// nuovo percorso da zero) - centro Italia, zoom abbastanza largo da orientarsi ma non
// inutilmente lontano visto che l'app e' pensata per il mercato italiano/europeo.
const DEFAULT_CENTER: LatLngTuple = [42.5, 12.5];
const DEFAULT_ZOOM = 6;

function ClickToPlace({ onClick }: { onClick: (pt: LatLon) => void }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

// Centra/adatta la mappa SOLO quando focusTrigger cambia (incrementato dal genitore alla
// selezione di un risultato di ricerca indirizzo) - non ad ogni variazione di start/end,
// altrimenti anche un trascinamento manuale del marker farebbe "scattare" la mappa sotto le
// dita dell'utente subito dopo averlo rilasciato.
function FocusOnChange({ start, end, focusTrigger }: { start: LatLon | null; end: LatLon | null; focusTrigger: number }) {
  const map = useMap();
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (start && end) {
      const bounds: LatLngBoundsExpression = [
        [start.lat, start.lon],
        [end.lat, end.lon],
      ];
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    } else if (start) {
      map.setView([start.lat, start.lon], Math.max(map.getZoom(), 14));
    } else if (end) {
      map.setView([end.lat, end.lon], Math.max(map.getZoom(), 14));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTrigger]);
  return null;
}

// Editor visuale di partenza/arrivo + raggio di tolleranza per un percorso preimpostato
// (jaedrive_todo #14). Partenza/arrivo si impostano cliccando sulla mappa (se ancora
// assenti), trascinando il marker (per affinare), o scegliendo un risultato di
// AddressSearch (il genitore chiama onSetStart/onSetEnd e incrementa focusTrigger). Il
// cerchio del raggio si ridisegna in tempo reale seguendo radiusMeters, stesso valore
// condiviso da entrambi i punti (schema PresetRoute non ne prevede due separati).
export function RouteMapEditor({
  start,
  end,
  radiusMeters,
  onSetStart,
  onSetEnd,
  focusTrigger,
  placingMode,
}: {
  start: LatLon | null;
  end: LatLon | null;
  radiusMeters: number;
  onSetStart: (pt: LatLon) => void;
  onSetEnd: (pt: LatLon) => void;
  focusTrigger: number;
  // Quale marker riceve il prossimo click sulla mappa - se entrambi i punti sono gia'
  // impostati il click non fa nulla (si usa il trascinamento per spostarli).
  placingMode: "start" | "end";
}) {
  // Calcolati solo al mount (dipendenze vuote apposta) - dopo e' FocusOnChange a muovere la
  // mappa. In modifica di un percorso gia' esistente partenza E arrivo sono gia' entrambi
  // presenti al primo render: serve un fitBounds fin da subito (non solo un center sulla
  // partenza), altrimenti l'arrivo potrebbe restare fuori dallo schermo se il percorso e'
  // lungo.
  const initialBounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (start && end) {
      return [
        [start.lat, start.lon],
        [end.lat, end.lon],
      ];
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const initialCenter = useMemo<LatLngTuple>(() => {
    if (start) return [start.lat, start.lon];
    if (end) return [end.lat, end.lon];
    return DEFAULT_CENTER;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialZoom = start || end ? 14 : DEFAULT_ZOOM;

  function handleMapClick(pt: LatLon) {
    if (placingMode === "start" && !start) onSetStart(pt);
    else if (placingMode === "end" && !end) onSetEnd(pt);
  }

  return (
    <div className="h-96 overflow-hidden rounded-lg border border-surface-border">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        {...(initialBounds ? { bounds: initialBounds, boundsOptions: { padding: [60, 60] as [number, number] } } : {})}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToPlace onClick={handleMapClick} />
        <FocusOnChange start={start} end={end} focusTrigger={focusTrigger} />

        {start && (
          <>
            <Marker
              position={[start.lat, start.lon]}
              icon={START_ICON}
              draggable
              eventHandlers={{ dragend: (e) => onSetStart({ lat: e.target.getLatLng().lat, lon: e.target.getLatLng().lng }) }}
            />
            <Circle center={[start.lat, start.lon]} radius={radiusMeters} pathOptions={{ color: "#00BFFF", fillOpacity: 0.08 }} />
          </>
        )}
        {end && (
          <>
            <Marker
              position={[end.lat, end.lon]}
              icon={END_ICON}
              draggable
              eventHandlers={{ dragend: (e) => onSetEnd({ lat: e.target.getLatLng().lat, lon: e.target.getLatLng().lng }) }}
            />
            <Circle center={[end.lat, end.lon]} radius={radiusMeters} pathOptions={{ color: "#9E9E9E", fillOpacity: 0.08 }} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
