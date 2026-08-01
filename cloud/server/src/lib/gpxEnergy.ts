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
