import { useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";
import { parseGpxTrack } from "../lib/gpx";
import { BUCKET_COLOR } from "../lib/energyFlow";

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useMemo(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

// Stessa pathData/significato delle icone di partenza/arrivo usate altrove (TripRow,
// TripDetail, components/icons.tsx, e la mappa OSM online dell'app Android) - pin di
// partenza (tinto accento), bandiera a scacchi di arrivo (mai tinta, il pattern
// bianco/nero e' il punto). className:"" evita il box bianco di default di Leaflet per i
// divIcon, l'ancoraggio riflette dove si trova davvero la "punta" in ciascuna icona (centro
// per il pin, base dell'asta - sul lato sinistro - per la bandiera).
const START_ICON = L.divIcon({
  className: "",
  html: '<svg viewBox="0 0 24 24" width="28" height="28" fill="#00BFFF"><path fill-rule="evenodd" clip-rule="evenodd" d="M12,2C8.13,2 5,5.13 5,9c0,5.25 7,13 7,13s7,-7.75 7,-13C19,5.13 15.87,2 12,2zM12,11.5c-1.38,0 -2.5,-1.12 -2.5,-2.5s1.12,-2.5 2.5,-2.5s2.5,1.12 2.5,2.5S13.38,11.5 12,11.5z"/></svg>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});
const END_ICON = L.divIcon({
  className: "",
  html: `<svg viewBox="0 0 24 24" width="28" height="28">
    <path fill="#9E9E9E" d="M4,3h1v18h-1z"/>
    <path fill="#212121" d="M5,3h3v4h-3zM11,3h3v4h-3zM8,7h3v4h-3zM14,7h3v4h-3z"/>
    <path fill="#EEEEEE" d="M8,3h3v4h-3zM14,3h3v4h-3zM5,7h3v4h-3zM11,7h3v4h-3z"/>
  </svg>`,
  iconSize: [28, 28],
  iconAnchor: [5, 28],
});

export function TripMap({ gpxRaw }: { gpxRaw: string }) {
  const segments = useMemo(() => parseGpxTrack(gpxRaw), [gpxRaw]);
  const allPoints = useMemo(() => segments.flatMap((s) => s.points), [segments]);

  if (allPoints.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-surface-border bg-surface text-sm text-onsurface-variant">
        Traccia GPS non disponibile o vuota.
      </div>
    );
  }

  return (
    <div className="h-96 overflow-hidden rounded-lg border border-surface-border">
      <MapContainer center={allPoints[0]} zoom={13} style={{ height: "100%", width: "100%" }}>
        {/* Same OSM tile provider the Android app's osmdroid map already uses, no API key. */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {segments.map((s, i) => (
          <Polyline key={i} positions={s.points} pathOptions={{ color: BUCKET_COLOR[s.bucket], weight: 4 }} />
        ))}
        <Marker position={allPoints[0]} icon={START_ICON} />
        <Marker position={allPoints[allPoints.length - 1]} icon={END_ICON} />
        <FitBounds bounds={allPoints} />
      </MapContainer>
    </div>
  );
}
