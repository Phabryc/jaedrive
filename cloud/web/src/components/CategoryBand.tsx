// Striscia categorica lungo la distanza del viaggio (drive mode, o modalita' energyFlow) -
// stesso principio gia' stabilito per la traccia sulla mappa (parseGpxTrack/TripMap):
// segmenti a taglio netto raggruppando le run contigue dello stesso valore, SENZA gap tra
// un segmento e l'altro (rappresentano un percorso fisico continuo, non barre separate -
// un gap qui spezzerebbe visivamente una strada che non si e' davvero interrotta).
export interface CategoryBandProps<T extends string> {
  title: string;
  distancesKm: number[];
  values: (T | null)[];
  colorMap: Record<T, string>;
  labelMap: Record<T, string>;
}

export function CategoryBand<T extends string>({ title, distancesKm, values, colorMap, labelMap }: CategoryBandProps<T>) {
  const totalKm = distancesKm[distancesKm.length - 1] ?? 0;

  type Segment = { value: T; fromKm: number; toKm: number };
  const segments: Segment[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const km = distancesKm[i] ?? 0;
    const last = segments[segments.length - 1];
    if (last && last.value === v) {
      last.toKm = km;
    } else {
      segments.push({ value: v, fromKm: km, toKm: km });
    }
  }

  const present = Array.from(new Set(segments.map((s) => s.value)));

  if (segments.length === 0 || totalKm <= 0) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium">{title}</p>
      <div className="flex h-4 overflow-hidden rounded-full">
        {segments.map((s, i) => {
          const span = Math.max(s.toKm - s.fromKm, totalKm * 0.002); // segmento minimo visibile
          return (
            <div
              key={i}
              title={`${labelMap[s.value]} · ${s.fromKm.toFixed(1)}–${s.toKm.toFixed(1)} km`}
              style={{ width: `${(span / totalKm) * 100}%`, backgroundColor: colorMap[s.value] }}
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
