// Reverse geocoding via Nominatim (OpenStreetMap) - stesso servizio e stessa logica di
// estrazione indirizzo gia' usati lato Android (TrackingService.reverseGeocode()). Usato
// qui in due punti: (1) routes/device.ts, come fallback quando un trip arriva senza
// label/startLabel perche' l'auto non aveva internet al momento della chiusura del
// viaggio (l'upload stesso richiede pero' connessione, quindi arrivati qui la si ha gia');
// (2) il backfill on-demand per i trip gia' caricati prima di questo fallback
// (routes/user.ts, POST .../backfill-addresses).
const USER_AGENT = "JaeDrive-Server/1.0 (+https://jaedrive.com)";

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  footway?: string;
  residential?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  county?: string;
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=17&addressdetails=1`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const json = (await res.json()) as { address?: NominatimAddress; display_name?: string };
    const addr = json.address;
    if (!addr) return json.display_name ?? null;
    const road = addr.road ?? addr.pedestrian ?? addr.footway ?? addr.residential;
    const place = addr.city ?? addr.town ?? addr.village ?? addr.suburb ?? addr.county;
    if (road && place) return `${road}, ${place}`;
    return place ?? road ?? json.display_name ?? null;
  } catch {
    return null;
  }
}

// Estrae lat/lon del primo e ultimo <trkpt> da un GPX grezzo - una regex invece di un
// parser XML completo, sufficiente per questo unico scopo (ci serve solo l'attributo di
// due punti specifici, non l'intero documento).
export function firstAndLastPoint(gpxRaw: string): { first: { lat: number; lon: number }; last: { lat: number; lon: number } } | null {
  const matches = [...gpxRaw.matchAll(/<trkpt lat="(-?[\d.]+)" lon="(-?[\d.]+)"/g)];
  if (matches.length === 0) return null;
  const first = matches[0];
  const last = matches[matches.length - 1];
  return {
    first: { lat: Number(first[1]), lon: Number(first[2]) },
    last: { lat: Number(last[1]), lon: Number(last[2]) },
  };
}
