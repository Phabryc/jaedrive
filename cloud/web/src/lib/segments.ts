// Raggruppa una serie di valori categorici campionati lungo la distanza in run contigue
// dello stesso valore (taglio netto, non una sfumatura) - stessa logica gia' usata per la
// traccia sulla mappa (parseGpxTrack), condivisa qui tra CategoryBand e le markArea dei
// grafici a linea (es. batteria/carburante con sfondo colorato per modalita' energia).
export interface RunSegment<T> {
  value: T;
  fromKm: number;
  toKm: number;
}

export function computeRunSegments<T>(distancesKm: number[], values: (T | null)[]): RunSegment<T>[] {
  const segments: RunSegment<T>[] = [];
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
  return segments;
}
