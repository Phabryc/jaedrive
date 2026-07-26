// Aggregazione statistiche su un insieme di trip - estratta da routes/user.ts GET
// .../stats perche' la stessa identica logica serve anche per un sottoinsieme di trip
// (percorso preimpostato - vedi PresetRoute in schema.prisma - o il range di date di un
// trip manuale, vedi jaedrive_todo #14/#15), non solo per "tutti i trip di un veicolo".
// Calcolata sempre a runtime su un array gia' in memoria, mai query aggregate SQL - stessa
// scelta/limite gia' accettato per l'endpoint originale (scala personale, non fleet).

export interface StatsTripInput {
  id: string;
  kind: string;
  startedAt: Date;
  label: string | null;
  km: number | null;
  liters: number | null;
  avgConsumption: number | null;
  pctEv: number | null;
  pctSeries: number | null;
  pctParallel: number | null;
  pctOther: number | null;
  pctEco: number | null;
  pctNormal: number | null;
  pctSport: number | null;
  kmEv: number | null;
  kmHev: number | null;
}

export interface TripStatsRef {
  id: string;
  label: string | null;
  startedAt: Date;
  avgConsumption: number | null;
  km: number | null;
}

export interface VehicleStatsResult {
  totals: { km: number; liters: number; tripCount: number; co2Kg: number };
  energyFlowBreakdown: { pctEv: number | null; pctSeries: number | null; pctParallel: number | null; pctOther: number | null };
  driveModeBreakdown: { pctEco: number | null; pctNormal: number | null; pctSport: number | null };
  evHevKmSplit: { kmEv: number; kmHev: number } | null;
  kindBreakdown: Record<string, { count: number; km: number }>;
  consumptionTrend: { date: string; avgConsumption: number }[];
  bestTrip: TripStatsRef | null;
  worstTrip: TripStatsRef | null;
}

type PctField = "pctEv" | "pctSeries" | "pctParallel" | "pctOther" | "pctEco" | "pctNormal" | "pctSport";

export function computeVehicleStats(trips: StatsTripInput[]): VehicleStatsResult {
  // Media pesata per km: un viaggio di 200km pesa piu' di uno di 2km nella % complessiva,
  // a differenza di una semplice media aritmetica tra viaggi.
  function weightedPct(field: PctField) {
    let weightedSum = 0;
    let totalKm = 0;
    for (const t of trips) {
      if (t[field] == null || t.km == null) continue;
      weightedSum += t[field]! * t.km;
      totalKm += t.km;
    }
    return totalKm > 0 ? weightedSum / totalKm : null;
  }

  const totalKm = trips.reduce((s, t) => s + (t.km ?? 0), 0);
  const totalLiters = trips.reduce((s, t) => s + (t.liters ?? 0), 0);
  // Fattore di emissione benzina standard (~2.31 kg CO2/litro) - stima rispetto a un
  // "tutto benzina" (vedi DESIGN.md §12), non una misura reale delle emissioni del
  // powertrain ibrido: e' semplicemente i litri effettivamente bruciati * fattore fisso.
  const co2Kg = totalLiters * 2.31;

  const consumable = trips.filter((t) => t.avgConsumption != null && t.km != null && t.km >= 1);
  const bestTrip = consumable.length
    ? consumable.reduce((a, b) => (b.avgConsumption! > a.avgConsumption! ? b : a))
    : null;
  const worstTrip = consumable.length
    ? consumable.reduce((a, b) => (b.avgConsumption! < a.avgConsumption! ? b : a))
    : null;

  const kindBreakdown: Record<string, { count: number; km: number }> = {};
  for (const t of trips) {
    const k = kindBreakdown[t.kind] ?? { count: 0, km: 0 };
    k.count += 1;
    k.km += t.km ?? 0;
    kindBreakdown[t.kind] = k;
  }

  // Trend consumo: media (non pesata) tra i viaggi dello stesso giorno - una linea al
  // giorno e' gia' abbastanza densa per l'uso personale di questo veicolo, niente
  // aggregazione settimanale/mensile per ora (si puo' aggiungere se il range diventa lungo).
  const trendByDay = new Map<string, { sum: number; count: number }>();
  for (const t of trips) {
    if (t.avgConsumption == null) continue;
    const day = t.startedAt.toISOString().slice(0, 10);
    const entry = trendByDay.get(day) ?? { sum: 0, count: 0 };
    entry.sum += t.avgConsumption;
    entry.count += 1;
    trendByDay.set(day, entry);
  }
  const consumptionTrend = Array.from(trendByDay.entries())
    .map(([date, { sum, count }]) => ({ date, avgConsumption: sum / count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const kmEvTotal = trips.reduce((s, t) => s + (t.kmEv ?? 0), 0);
  const kmHevTotal = trips.reduce((s, t) => s + (t.kmHev ?? 0), 0);
  const evHevSampleCount = trips.filter((t) => t.kmEv != null || t.kmHev != null).length;

  return {
    totals: { km: totalKm, liters: totalLiters, tripCount: trips.length, co2Kg },
    energyFlowBreakdown: {
      pctEv: weightedPct("pctEv"),
      pctSeries: weightedPct("pctSeries"),
      pctParallel: weightedPct("pctParallel"),
      pctOther: weightedPct("pctOther"),
    },
    driveModeBreakdown: {
      pctEco: weightedPct("pctEco"),
      pctNormal: weightedPct("pctNormal"),
      pctSport: weightedPct("pctSport"),
    },
    // null se nessun trip ha ancora questo dato (feature piu' recente di pctEv/...).
    evHevKmSplit: evHevSampleCount > 0 ? { kmEv: kmEvTotal, kmHev: kmHevTotal } : null,
    kindBreakdown,
    consumptionTrend,
    bestTrip: bestTrip
      ? { id: bestTrip.id, label: bestTrip.label, startedAt: bestTrip.startedAt, avgConsumption: bestTrip.avgConsumption, km: bestTrip.km }
      : null,
    worstTrip: worstTrip
      ? { id: worstTrip.id, label: worstTrip.label, startedAt: worstTrip.startedAt, avgConsumption: worstTrip.avgConsumption, km: worstTrip.km }
      : null,
  };
}
