import { haversineMeters } from "./geo.js";

// Ricalcolo km EV/HEV dalla traccia GPX grezza gia' salvata (colonna trips.gpx_raw) - stessa
// logica di EnergyFlowUtil.computeKmByBucket() lato Android (vedi quel file per il perche':
// ID_EV_MILEAGE/ID_HEV_MILEAGE via VDB non sono affidabili per questo, confermato sul campo
// 2026-08-01 - ID_HEV_MILEAGE restituisce sempre lo stesso valore dell'odometro totale). Il
// nuovo codice Android calcola gia' km EV/HEV cosi' per ogni futuro upload; questo modulo
// serve solo al backfill (routes/user.ts POST .../backfill-energy-km) dei trip caricati PRIMA
// di quel fix, la cui traccia GPX pero' e' gia' sul server - nessun bisogno di ricontattare
// il device.
//
// Stessa tabella bucket di com.phabryc.jaedrive.EnergyFlowUtil (tabella "two_wheel_",
// confermata sul campo 2026-07-23 - vedi quel file per la cronologia completa).
type Bucket = "EV" | "HEV" | "OTHER";

function bucketFor(value: number): Bucket {
  switch (value) {
    case 2:
      return "EV";
    case 4:
    case 5:
    case 11:
    case 8:
    case 10:
      return "HEV"; // serie (4/5/11) o parallelo (8/10) - vedi EnergyFlowUtil per la distinzione, qui accorpati come gia' fatto per kmHev
    default:
      return "OTHER"; // CHR (12/13/15/16) e IDLE (1/3/6/7/9/14) - ne' elettrico ne' termico in movimento
  }
}

interface TrackPoint {
  lat: number;
  lon: number;
  energyFlow: number | null;
}

// Estrae lat/lon/energyFlow di ogni <trkpt> con una regex invece di un parser XML completo -
// stessa strategia pragmatica di firstAndLastPoint() in lib/geocode.ts, qui serve pero' OGNI
// punto (non solo il primo/ultimo) per misurare la distanza segmento per segmento.
function extractPoints(gpxRaw: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  const trkptRegex = /<trkpt lat="(-?[\d.]+)" lon="(-?[\d.]+)">([\s\S]*?)<\/trkpt>/g;
  for (const m of gpxRaw.matchAll(trkptRegex)) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    const efMatch = m[3].match(/energyFlow>(-?\d+)</);
    points.push({ lat, lon, energyFlow: efMatch ? Number(efMatch[1]) : null });
  }
  return points;
}

// Distanza GPS reale di ogni segmento della traccia, attribuita al bucket ENERGY_FLOW
// campionato al punto di PARTENZA del segmento - piu' preciso di "km totali * percentuale
// campioni" perche' pesa sui km effettivamente coperti in quel tratto, non sul numero di
// campioni. Ritorna null se la traccia ha meno di due punti o nessun campione ENERGY_FLOW
// valido (es. traccia registrata prima che questo dato esistesse).
export function computeKmByBucket(gpxRaw: string): { kmEv: number; kmHev: number } | null {
  const points = extractPoints(gpxRaw);
  if (points.length < 2) return null;
  let kmEv = 0;
  let kmHev = 0;
  let anyKnown = false;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev.energyFlow == null || prev.energyFlow < 0) continue;
    anyKnown = true;
    const segmentKm = haversineMeters(prev, cur) / 1000;
    const bucket = bucketFor(prev.energyFlow);
    if (bucket === "EV") kmEv += segmentKm;
    else if (bucket === "HEV") kmHev += segmentKm;
  }
  if (!anyKnown) return null;
  return { kmEv, kmHev };
}

// --- Ripartizione flusso energia per i viaggi MANUALI (richiesta esplicita 2026-08-02) ---
//
// Un viaggio manuale non ha una traccia GPX propria (solo un delta km/litri su uno slot
// A/B), ma il tracciamento automatico gira SEMPRE in parallelo sullo stesso veicolo (vedi
// Android TrackingService: ogni delta va "sia al viaggio automatico corrente (se aperto) sia
// SEMPRE ai due trip computer manuali" - i due sistemi sono indipendenti e concorrenti, mai
// l'uno in pausa per l'altro). Quindi per lo stesso intervallo di tempo [startedAt, endedAt]
// del manuale possono gia' esistere una o piu' tracce GPX di trip AUTO (uno per ogni ciclo di
// accensione avvenuto in quella finestra) - qui si aggregano i loro campioni ENERGY_FLOW
// filtrati al solo intervallo di tempo effettivo del viaggio manuale.
type FourBucket = "EV" | "SERIES" | "PARALLEL" | "OTHER";

// Stessa tabella di EnergyFlowUtil.bucketFor() lato Android, ma a 4 categorie (non 3 come
// bucketFor() qui sopra): CHR e IDLE restano fusi in "OTHER", esattamente come fa
// EnergyFlowUtil.computeUploadBreakdown() per i pctEv/pctSeries/pctParallel/pctOther gia'
// salvati sui trip AUTO - stessa metodologia (% di CAMPIONI, non km-weighted come
// computeKmByBucket sopra) per restare confrontabile con quei valori.
function fourBucketFor(value: number): FourBucket {
  switch (value) {
    case 2:
      return "EV";
    case 4:
    case 5:
    case 11:
      return "SERIES";
    case 8:
    case 10:
      return "PARALLEL";
    default:
      return "OTHER";
  }
}

interface TimedFlowPoint {
  timeMs: number;
  energyFlow: number | null;
}

// Come extractPoints() sopra ma con il timestamp (<time>, ISO8601 UTC scritto da Android
// TrackingService.buildGpx()) invece di lat/lon - qui serve SELEZIONARE i campioni per
// intervallo di tempo, non misurare distanze.
function extractTimedFlowPoints(gpxRaw: string): TimedFlowPoint[] {
  const points: TimedFlowPoint[] = [];
  const trkptRegex = /<trkpt lat="-?[\d.]+" lon="-?[\d.]+">([\s\S]*?)<\/trkpt>/g;
  for (const m of gpxRaw.matchAll(trkptRegex)) {
    const body = m[1];
    const timeMatch = body.match(/<time>([^<]+)<\/time>/);
    if (!timeMatch) continue;
    const timeMs = Date.parse(timeMatch[1]);
    if (Number.isNaN(timeMs)) continue;
    const efMatch = body.match(/energyFlow>(-?\d+)</);
    points.push({ timeMs, energyFlow: efMatch ? Number(efMatch[1]) : null });
  }
  return points;
}

export interface FlowBreakdown {
  pctEv: number;
  pctSeries: number;
  pctParallel: number;
  pctOther: number;
}

// gpxList: le tracce GPX di TUTTI i trip AUTO che si sovrappongono al range del viaggio
// manuale (query a carico del chiamante, vedi routes/user.ts GET /trips/:id) - possono
// essere piu' di una traccia se il viaggio manuale e' rimasto aperto per piu' accensioni.
// Ritorna null se nessun campione ENERGY_FLOW valido cade nell'intervallo (es. nessun trip
// AUTO sovrapposto, o nessuno con questo dato).
export function computeFlowBreakdownForRange(gpxList: string[], rangeStart: Date, rangeEnd: Date): FlowBreakdown | null {
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  let ev = 0;
  let series = 0;
  let parallel = 0;
  let other = 0;
  let known = 0;
  for (const gpxRaw of gpxList) {
    for (const p of extractTimedFlowPoints(gpxRaw)) {
      if (p.timeMs < startMs || p.timeMs > endMs) continue;
      if (p.energyFlow == null || p.energyFlow < 0) continue;
      known++;
      switch (fourBucketFor(p.energyFlow)) {
        case "EV":
          ev++;
          break;
        case "SERIES":
          series++;
          break;
        case "PARALLEL":
          parallel++;
          break;
        case "OTHER":
          other++;
          break;
      }
    }
  }
  if (known === 0) return null;
  return {
    pctEv: (100 * ev) / known,
    pctSeries: (100 * series) / known,
    pctParallel: (100 * parallel) / known,
    pctOther: (100 * other) / known,
  };
}
