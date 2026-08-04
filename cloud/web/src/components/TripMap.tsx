import { useMemo, useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import type L from "leaflet";
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
      if (minIdx !== -1 && minDist < 0.05) {
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
    <div className="p-1 text-xs text-slate-100 space-y-2 min-w-[220px] max-w-[280px]">
      <div className="font-semibold text-xs text-sky-400 border-b border-slate-700 pb-1.5 flex items-center gap-1">
        <span>📍</span>
        <span className="truncate">{address || "Caricamento indirizzo..."}</span>
      </div>

      <div className="text-[11px] text-slate-300 space-y-1">
        <div className="font-mono text-[10px] text-slate-400">
          {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
          {point.ele != null && ` • ${Math.round(point.ele)}m`}
        </div>
        <div className="flex flex-wrap gap-x-2 text-slate-300">
          <span>Ora: <strong className="text-white">{timeStr}</strong></span>
          {distance != null && (
            <span>Distanza: <strong className="text-white">{distance.toFixed(1)} {distanceUnit}</strong></span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 py-0.5">
        <span
          className="px-2 py-0.5 rounded text-[11px] font-bold text-white shadow-sm"
          style={{ backgroundColor: BUCKET_COLOR[point.bucket] }}
        >
          {BUCKET_LABEL[point.bucket]}
        </span>
        {point.driveMode != null && (
          <span
            className="px-2 py-0.5 rounded text-[11px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: DRIVE_MODE_COLOR[String(point.driveMode) as keyof typeof DRIVE_MODE_COLOR] }}
          >
            {DRIVE_MODE_LABEL[String(point.driveMode) as keyof typeof DRIVE_MODE_LABEL]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] pt-1.5 border-t border-slate-700">
        <div>
          <span className="text-slate-400">Velocità:</span>{" "}
          <strong className="text-white font-bold">{speedVal} {sUnit}</strong>
        </div>
        <div>
          <span className="text-slate-400">SOC Batt.:</span>{" "}
          <strong className="text-white font-bold">{point.batteryPct != null ? `${point.batteryPct}%` : "–"}</strong>
        </div>
        <div>
          <span className="text-slate-400">Carburante:</span>{" "}
          <strong className="text-white font-bold">{point.fuelPct != null ? `${point.fuelPct}%` : "–"}</strong>
        </div>
        {regenStr && (
          <div>
            <span className="text-slate-400">Rigeneraz.:</span>{" "}
            <strong className="text-white font-bold">{regenStr}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// Marker component that automatically opens its popup on render or position change
function AutoOpenMarker({
  position,
  icon,
  children,
  onClose,
}: {
  position: [number, number];
  icon: L.DivIcon;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.openPopup();
    }
  }, [position]);

  return (
    <Marker ref={markerRef} position={position} icon={icon}>
      <Popup autoPan={false} eventHandlers={{ remove: () => onClose?.() }}>
        {children}
      </Popup>
    </Marker>
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

  const handleTrackInteraction = (latlng: L.LatLng) => {
    if (!points.length || !onSelectIndex) return;
    let minDist = Infinity;
    let minIdx = -1;
    for (let i = 0; i < points.length; i++) {
      const d = Math.hypot(points[i].lat - latlng.lat, points[i].lon - latlng.lng);
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }
    if (minIdx !== -1) {
      onSelectIndex(minIdx);
    }
  };

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
          <g key={i}>
            {/* Thick invisible polyline for easy touch/click target area */}
            <Polyline
              positions={s.points}
              pathOptions={{ color: "transparent", weight: 20 }}
              eventHandlers={{
                click: (e) => handleTrackInteraction(e.latlng),
                mouseover: (e) => handleTrackInteraction(e.latlng),
              }}
            />
            {/* Visible track polyline */}
            <Polyline
              positions={s.points}
              pathOptions={{ color: BUCKET_COLOR[s.bucket], weight: 5 }}
              eventHandlers={{
                click: (e) => handleTrackInteraction(e.latlng),
                mouseover: (e) => handleTrackInteraction(e.latlng),
              }}
            />
          </g>
        ))}
        <Marker position={allPoints[0]} icon={START_ICON} />
        <Marker position={allPoints[allPoints.length - 1]} icon={END_ICON} />

        {selectedPoint && selectedPos && (
          <AutoOpenMarker
            position={selectedPos}
            icon={HIGHLIGHT_ICON}
            onClose={() => onSelectIndex?.(null)}
          >
            <PointPopupContent
              point={selectedPoint}
              distance={selectedIndex != null && distances ? distances[selectedIndex] : undefined}
            />
          </AutoOpenMarker>
        )}

        <MapSyncController selectedPos={selectedPos} />
        <MapClickHandler points={points} onSelectIndex={onSelectIndex} />
        <FitBounds bounds={allPoints} />
      </MapContainer>
    </div>
  );
}
