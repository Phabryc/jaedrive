// Raggruppa una serie di valori categorici campionati lungo la distanza in run contigue
// dello stesso valore (taglio netto, non una sfumatura) - stessa logica gia' usata per la
// traccia sulla mappa (parseGpxTrack), condivisa qui tra CategoryBand e le markArea dei
// grafici a linea (es. batteria/carburante con sfondo colorato per modalita' energia).
// Generica sull'unita' di distanza: i chiamanti passano gia' l'array convertito nell'unita'
// scelta in Impostazioni (km o mi - vedi lib/units.ts), da qui i campi "from"/"to" senza
// suffisso "Km" (richiesta 2026-08-02: prima erano fromKm/toKm ma potevano contenere miglia).
export interface RunSegment<T> {
  value: T;
  from: number;
  to: number;
}

export function computeRunSegments<T>(distances: number[], values: (T | null)[]): RunSegment<T>[] {
  const segments: RunSegment<T>[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const d = distances[i] ?? 0;
    const last = segments[segments.length - 1];
    if (last && last.value === v) {
      last.to = d;
    } else {
      segments.push({ value: v, from: d, to: d });
    }
  }
  return segments;
}
