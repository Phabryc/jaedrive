import { computeRunSegments } from "../lib/segments";
import type { DistanceUnit } from "../lib/units";

// Striscia categorica lungo la distanza del viaggio (drive mode) - stesso principio gia'
// stabilito per la traccia sulla mappa (parseGpxTrack/TripMap): segmenti a taglio netto
// raggruppando le run contigue dello stesso valore, SENZA gap tra un segmento e l'altro
// (rappresentano un percorso fisico continuo, non barre separate - un gap qui spezzerebbe
// visivamente una strada che non si e' davvero interrotta).

export interface CategoryBandProps<T extends string> {
  title: string;
  // Gia' convertite nell'unita' scelta dal chiamante (vedi TripDetail.tsx) - le proporzioni
  // (span/total) restano corrette qualunque sia l'unita', e' solo il tooltip che ha bisogno
  // di sapere quale unita' scrivere.
  distances: number[];
  unit: DistanceUnit;
  values: (T | null)[];
  colorMap: Record<T, string>;
  labelMap: Record<T, string>;
}

export function CategoryBand<T extends string>({ title, distances, unit, values, colorMap, labelMap }: CategoryBandProps<T>) {
  const total = distances[distances.length - 1] ?? 0;
  const segments = computeRunSegments(distances, values);
  const present = Array.from(new Set(segments.map((s) => s.value)));

  if (segments.length === 0 || total <= 0) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium">{title}</p>
      <div className="flex h-4 overflow-hidden rounded-full">
        {segments.map((s, i) => {
          const span = Math.max(s.to - s.from, total * 0.002); // segmento minimo visibile
          return (
            <div
              key={i}
              title={`${labelMap[s.value]} · ${s.from.toFixed(1)}–${s.to.toFixed(1)} ${unit}`}
              style={{ width: `${(span / total) * 100}%`, backgroundColor: colorMap[s.value] }}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-onsurface-variant">
        {present.map((v) => (
          <span key={v} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorMap[v] }} />
            {labelMap[v]}
          </span>
        ))}
      </div>
    </div>
  );
}
