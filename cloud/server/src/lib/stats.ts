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
  liters: number | null;
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

  // Un viaggio con km reali ma 0 litri consumati (es. tratto interamente in elettrico su
  // un ibrido) e' il caso migliore possibile, non un dato mancante - trattarlo come
  // avgConsumption=null (e quindi escluderlo da migliore/peggiore) buttava via proprio i
  // viaggi che l'utente vuole veder premiati. km/l e' pero' indefinito quando i litri sono
  // zero: per il confronto lo trattiamo come Infinity (vince sempre come "migliore", non e'
  // mai selezionato come "peggiore" a meno che sia l'unico viaggio disponibile).
  function effectiveAvg(t: StatsTripInput): number | null {
    if (t.avgConsumption != null) return t.avgConsumption;
    if (t.liters === 0) return Infinity;
    return null;
  }

  const consumable = trips
    .filter((t) => t.km != null && t.km >= 1 && effectiveAvg(t) != null)
    .map((t) => ({ t, eff: effectiveAvg(t)! }));
  const bestTrip = consumable.length
    ? consumable.reduce((a, b) => (b.eff > a.eff ? b : a)).t
    : null;
  const worstTrip = consumable.length
    ? consumable.reduce((a, b) => (b.eff < a.eff ? b : a)).t
    : null;

  const kindBreakdown: Record<string, { count: number; km: number }> = {};
  for (const t of trips) {
    const k = kindBreakdown[t.kind] ?? { count: 0, km: 0 };
    k.count += 1;
    k.km += t.km ?? 0;
    kindBreakdown[t.kind] = k;
  }

  // Trend consumo: km totali / litri totali del giorno (non media aritmetica dei km/l dei
  // singoli viaggi) - un viaggio lungo pesa piu' di uno breve, ed un viaggio a 0 litri
  // (tratto elettrico) contribuisce comunque i suoi km al numeratore invece di essere
  // scartato come "non calcolabile". Una linea al giorno e' gia' abbastanza densa per
  // l'uso personale di questo veicolo, niente aggregazione settimanale/mensile per ora.
  const trendByDay = new Map<string, { km: number; liters: number }>();
  for (const t of trips) {
    if (t.km == null || t.liters == null) continue;
    const day = t.startedAt.toISOString().slice(0, 10);
    const entry = trendByDay.get(day) ?? { km: 0, liters: 0 };
    entry.km += t.km;
    entry.liters += t.liters;
    trendByDay.set(day, entry);
  }
  const consumptionTrend = Array.from(trendByDay.entries())
    // Una giornata interamente elettrica (0 litri totali) non ha un km/l rappresentabile:
    // esclusa dal grafico invece di comparire come 0 o Infinity.
    .filter(([, { liters }]) => liters > 0)
    .map(([date, { km, liters }]) => ({ date, avgConsumption: km / liters }))
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
      ? { id: bestTrip.id, label: bestTrip.label, startedAt: bestTrip.startedAt, avgConsumption: bestTrip.avgConsumption, km: bestTrip.km, liters: bestTrip.liters }
      : null,
    worstTrip: worstTrip
      ? { id: worstTrip.id, label: worstTrip.label, startedAt: worstTrip.startedAt, avgConsumption: worstTrip.avgConsumption, km: worstTrip.km, liters: worstTrip.liters }
      : null,
  };
}
