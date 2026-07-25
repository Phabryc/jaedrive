import { useMemo } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { parseGpxTrack } from "../lib/gpx";
import { BUCKET_COLOR } from "../lib/energyFlow";

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useMemo(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

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
        <FitBounds bounds={allPoints} />
      </MapContainer>
    </div>
  );
}
