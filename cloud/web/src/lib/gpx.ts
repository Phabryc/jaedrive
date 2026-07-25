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
