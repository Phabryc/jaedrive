import { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { type LatLngBoundsExpression } from "leaflet";
import { parseGpxTrack, parseGpxPoints, type GpxPoint } from "../lib/gpx";
import { BUCKET_COLOR, BUCKET_LABEL } from "../lib/energyFlow";
import { DRIVE_MODE_COLOR, DRIVE_MODE_LABEL } from "../lib/driveMode";
import { START_ICON, END_ICON, HIGHLIGHT_ICON } from "../lib/mapIcons";
import { reverseGeocode } from "../lib/reverseGeocode";
import { useUnits } from "../lib/UnitsContext";
import { toDisplaySpeedKmh, speedUnitLabel } from "../lib/units";

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useMemo(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

function MapSyncController({ selectedPos }: { selectedPos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (selectedPos) {
      map.panTo(selectedPos, { animate: true });
    }
  }, [map, selectedPos]);
  return null;
}

function MapClickHandler({
  points,
  onSelectIndex,
}: {
  points: GpxPoint[];
  onSelectIndex?: (idx: number | null) => void;
}) {
  useMapEvents({
    click(e) {
      if (!points.length || !onSelectIndex) return;
      let minDist = Infinity;
      let minIdx = -1;
      for (let i = 0; i < points.length; i++) {
        const d = Math.hypot(points[i].lat - e.latlng.lat, points[i].lon - e.latlng.lng);
        if (d < minDist) {
          minDist = d;
          minIdx = i;
        }
      }
      // ~2km radius threshold in lat/lon space (~0.02)
      if (minIdx !== -1 && minDist < 0.02) {
        onSelectIndex(minIdx);
      }
    },
  });
  return null;
}

function PointPopupContent({
  point,
  distance,
}: {
  point: GpxPoint;
  distance?: number;
}) {
  const { distanceUnit } = useUnits();
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    reverseGeocode(point.lat, point.lon).then((addr) => {
      if (active) setAddress(addr);
    });
    return () => {
      active = false;
    };
  }, [point.lat, point.lon]);

  const speedVal = point.speedKmh != null ? toDisplaySpeedKmh(point.speedKmh, distanceUnit).toFixed(0) : "–";
  const sUnit = speedUnitLabel(distanceUnit);
  const timeStr = point.t
    ? new Date(point.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "–";

  const regenStr =
    point.regenLevel === 0 ? "ALTO" : point.regenLevel === 1 ? "MEDIO" : point.regenLevel === 2 ? "BASSO" : null;

  return (
    <div className="p-1 text-xs text-onsurface space-y-2 min-w-[210px] max-w-[280px]">
      <div className="font-semibold text-xs text-primary border-b border-surface-border/60 pb-1 flex items-center gap-1">
        <span>📍</span>
        <span className="truncate">{address || "Caricamento indirizzo..."}</span>
      </div>

      <div className="text-[11px] text-onsurface-variant space-y-0.5">
        <div className="font-mono text-[10px]">
          {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
          {point.ele != null && ` • ${Math.round(point.ele)}m`}
        </div>
        <div>
          Ora: <span className="font-medium text-onsurface">{timeStr}</span>
          {distance != null && (
            <span>
              {" "}
              • Distanza: <span className="font-medium text-onsurface">{distance.toFixed(1)} {distanceUnit}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 pt-0.5">
        <span
          className="px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm"
          style={{ backgroundColor: BUCKET_COLOR[point.bucket] }}
        >
          {BUCKET_LABEL[point.bucket]}
        </span>
        {point.driveMode != null && (
          <span
            className="px-2 py-0.5 rounded text-[10px] font-medium text-white opacity-90"
            style={{ backgroundColor: DRIVE_MODE_COLOR[String(point.driveMode) as keyof typeof DRIVE_MODE_COLOR] }}
          >
            {DRIVE_MODE_LABEL[String(point.driveMode) as keyof typeof DRIVE_MODE_LABEL]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1 text-[11px] pt-1.5 border-t border-surface-border/60">
        <div>
          Velocità: <span className="font-semibold text-white">{speedVal} {sUnit}</span>
        </div>
        <div>
          SOC Batt.: <span className="font-semibold text-white">{point.batteryPct != null ? `${point.batteryPct}%` : "–"}</span>
        </div>
        <div>
          Carburante: <span className="font-semibold text-white">{point.fuelPct != null ? `${point.fuelPct}%` : "–"}</span>
        </div>
        {regenStr && (
          <div>
            Rigeneraz.: <span className="font-semibold text-white">{regenStr}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export interface TripMapProps {
  gpxRaw?: string;
  points?: GpxPoint[];
  distances?: number[];
  selectedIndex?: number | null;
  onSelectIndex?: (idx: number | null) => void;
}

export function TripMap({
  gpxRaw,
  points: pointsProp,
  distances,
  selectedIndex,
  onSelectIndex,
}: TripMapProps) {
  const segments = useMemo(() => (gpxRaw ? parseGpxTrack(gpxRaw) : []), [gpxRaw]);

  const points = useMemo(() => {
    if (pointsProp && pointsProp.length > 0) return pointsProp;
    if (gpxRaw) return parseGpxPoints(gpxRaw);
    return [];
  }, [pointsProp, gpxRaw]);

  const allPoints = useMemo(() => {
    if (points.length > 0) {
      return points.map((p) => [p.lat, p.lon] as [number, number]);
    }
    return segments.flatMap((s) => s.points);
  }, [points, segments]);

  if (allPoints.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-surface-border bg-surface text-sm text-onsurface-variant">
        Traccia GPS non disponibile o vuota.
      </div>
    );
  }

  const selectedPoint = selectedIndex != null && points[selectedIndex] ? points[selectedIndex] : null;
  const selectedPos: [number, number] | null = selectedPoint ? [selectedPoint.lat, selectedPoint.lon] : null;

  return (
    <div className="h-96 overflow-hidden rounded-lg border border-surface-border relative">
      <MapContainer center={allPoints[0]} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {segments.map((s, i) => (
          <Polyline key={i} positions={s.points} pathOptions={{ color: BUCKET_COLOR[s.bucket], weight: 4 }} />
        ))}
        <Marker position={allPoints[0]} icon={START_ICON} />
        <Marker position={allPoints[allPoints.length - 1]} icon={END_ICON} />

        {selectedPoint && selectedPos && (
          <Marker position={selectedPos} icon={HIGHLIGHT_ICON}>
            <Popup autoPan={false} eventHandlers={{ remove: () => onSelectIndex?.(null) }}>
              <PointPopupContent
                point={selectedPoint}
                distance={selectedIndex != null && distances ? distances[selectedIndex] : undefined}
              />
            </Popup>
          </Marker>
        )}

        <MapSyncController selectedPos={selectedPos} />
        <MapClickHandler points={points} onSelectIndex={onSelectIndex} />
        <FitBounds bounds={allPoints} />
      </MapContainer>
    </div>
  );
}
