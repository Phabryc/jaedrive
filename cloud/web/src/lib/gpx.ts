import { bucketFor, type EnergyBucket } from "./energyFlow";

export interface TrackPoint {
  lat: number;
  lon: number;
  bucket: EnergyBucket;
}

export interface TrackSegment {
  bucket: EnergyBucket;
  points: [number, number][];
}

// Parses the GPX produced by TrackingService.buildGpx() in the Android app, including its
// custom <jd:energyFlow> per-trkpt extension. Segments are grouped by contiguous same-bucket
// runs (hard cutover between colors, not a gradient) - same rule as the Android app's
// TripTraceView/showOnMap, see cloud/DESIGN.md §11.
export function parseGpxTrack(gpxRaw: string): TrackSegment[] {
  const doc = new DOMParser().parseFromString(gpxRaw, "application/xml");
  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));

  const points: TrackPoint[] = trkpts.map((el) => {
    const lat = Number(el.getAttribute("lat"));
    const lon = Number(el.getAttribute("lon"));
    const flowEl = el.getElementsByTagName("jd:energyFlow")[0] ?? el.getElementsByTagName("energyFlow")[0];
    const rawValue = flowEl ? Number(flowEl.textContent) : NaN;
    return { lat, lon, bucket: Number.isFinite(rawValue) ? bucketFor(rawValue) : "IDLE" };
  });

  const segments: TrackSegment[] = [];
  for (const p of points) {
    const last = segments[segments.length - 1];
    if (last && last.bucket === p.bucket) {
      last.points.push([p.lat, p.lon]);
    } else {
      // Repeat the previous point as the first of the new segment so segments connect
      // visually with no gap between colors.
      const bridge: [number, number][] = last ? [last.points[last.points.length - 1]] : [];
      segments.push({ bucket: p.bucket, points: [...bridge, [p.lat, p.lon]] });
    }
  }
  return segments.filter((s) => s.points.length > 1);
}

// One track point with every field TrackingService.buildGpx() can write, used to feed the
// per-trip time-series charts (TripDetail) - a separate, richer parse from parseGpxTrack()
// above (which stays focused on just lat/lon/bucket for the map, unchanged). null means the
// extension was absent for that point (e.g. a field added after the trip was recorded, or
// the signal not yet available when the point was sampled - see TrackingService).
export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number | null;
  t: number; // epoch ms, da <time>
  bucket: EnergyBucket;
  batteryPct: number | null;
  fuelPct: number | null;
  driveMode: number | null; // 0/1/2 = ECO/NORMAL/SPORT
  speedKmh: number | null;
  instConsumption: number | null; // valore grezzo, scala non confermata - vedi VDInfoClient (Android)
  regenLevel: number | null; // valore grezzo, scala non confermata
}

function tagNumber(el: Element, name: string): number | null {
  const found = el.getElementsByTagName(`jd:${name}`)[0] ?? el.getElementsByTagName(name)[0];
  if (!found?.textContent) return null;
  const v = Number(found.textContent);
  return Number.isFinite(v) ? v : null;
}

export function parseGpxPoints(gpxRaw: string): GpxPoint[] {
  const doc = new DOMParser().parseFromString(gpxRaw, "application/xml");
  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));

  return trkpts.map((el) => {
    const lat = Number(el.getAttribute("lat"));
    const lon = Number(el.getAttribute("lon"));
    const eleEl = el.getElementsByTagName("ele")[0];
    const timeEl = el.getElementsByTagName("time")[0];
    const flow = tagNumber(el, "energyFlow");
    return {
      lat,
      lon,
      ele: eleEl?.textContent ? Number(eleEl.textContent) : null,
      t: timeEl?.textContent ? new Date(timeEl.textContent).getTime() : 0,
      bucket: flow != null ? bucketFor(flow) : "IDLE",
      batteryPct: tagNumber(el, "batteryPct"),
      fuelPct: tagNumber(el, "fuelPct"),
      driveMode: tagNumber(el, "driveMode"),
      speedKmh: tagNumber(el, "speedKmh"),
      instConsumption: tagNumber(el, "instConsumption"),
      regenLevel: tagNumber(el, "regenLevel"),
    };
  });
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: GpxPoint, b: GpxPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Distanza cumulativa (km) lungo la traccia - asse X piu' onesto del tempo di parete per i
// grafici del dettaglio viaggio: una sosta lunga (semaforo, parcheggio) comprime nel tempo
// invece di allungare visivamente il grafico senza motivo.
export function cumulativeDistanceKm(points: GpxPoint[]): number[] {
  const out: number[] = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    out[i] = out[i - 1] + haversineKm(points[i - 1], points[i]);
  }
  return out;
}
