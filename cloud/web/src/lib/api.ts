import { auth } from "./firebase";
import type { Vehicle, TripDetail, TripsPage, VehicleStats, VehicleCalendarStats, PresetRoute, PresetRouteDetail, AddressResult } from "./types";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  const idToken = user ? await user.getIdToken() : undefined;

  const res = await fetch(`/api/user${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface Profile {
  id: string;
  email: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  profileComplete: boolean;
}

export const api = {
  me: () => request<Profile>("/me"),

  // acceptLegal deve essere letteralmente true (il server usa uno schema "const: true",
  // rifiuta con 400 qualunque altro valore) - vedi Onboarding.tsx per il checkbox
  // obbligatorio che lo produce.
  updateProfile: (data: { firstName: string; lastName: string; acceptLegal: true }) =>
    request<Profile>("/me", { method: "PATCH", body: JSON.stringify(data) }),

  // Cancellazione account completa (jaedrive_todo #1) - Firebase + Postgres lato server,
  // vedi routes/user.ts. Il chiamante deve comunque fare signOut() lato client dopo: il
  // token gia' emesso resta valido finche' non scade anche se l'identita' che lo ha
  // firmato non esiste piu' server-side.
  deleteAccount: () => request<void>("/me", { method: "DELETE" }),

  vehicles: () => request<Vehicle[]>("/vehicles"),

  renameVehicle: (id: string, nickname: string) =>
    request<Vehicle>(`/vehicles/${id}`, { method: "PATCH", body: JSON.stringify({ nickname }) }),

  deleteVehicle: (id: string) => request<void>(`/vehicles/${id}`, { method: "DELETE" }),

  claimPairingCode: (code: string) =>
    request<{ vehicleId: string }>("/pairing/claim", { method: "POST", body: JSON.stringify({ code }) }),

  trips: (vehicleId: string, params: { page?: number; kind?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.kind) qs.set("kind", params.kind);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<TripsPage>(`/vehicles/${vehicleId}/trips${suffix}`);
  },

  trip: (id: string) => request<TripDetail>(`/trips/${id}`),

  deleteTrip: (id: string) => request<void>(`/trips/${id}`, { method: "DELETE" }),

  stats: (vehicleId: string, params: { from?: string; to?: string; kind?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.kind) qs.set("kind", params.kind);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<VehicleStats>(`/vehicles/${vehicleId}/stats${suffix}`);
  },

  statsCalendar: (vehicleId: string, year?: number) =>
    request<VehicleCalendarStats>(`/vehicles/${vehicleId}/stats/calendar${year ? `?year=${year}` : ""}`),

  // Ricerca indirizzo (editor mappa percorsi, jaedrive_todo #14) - proxy verso Nominatim,
  // vedi routes/user.ts.
  geocodeSearch: (q: string) => request<AddressResult[]>(`/geocode/search?q=${encodeURIComponent(q)}`),

  // Percorsi preimpostati (jaedrive_todo #14) - vedi routes/user.ts. Le coordinate sono
  // opzionali sia in creazione (in alternativa a sourceTripId) sia in modifica (l'editor
  // mappa puo' riposizionare partenza/arrivo di un percorso gia' esistente).
  routes: (vehicleId: string) => request<PresetRoute[]>(`/vehicles/${vehicleId}/routes`),

  createRoute: (
    vehicleId: string,
    data: {
      name: string;
      sourceTripId?: string;
      startLat?: number;
      startLon?: number;
      endLat?: number;
      endLon?: number;
      radiusMeters?: number;
    },
  ) => request<PresetRoute>(`/vehicles/${vehicleId}/routes`, { method: "POST", body: JSON.stringify(data) }),

  updateRoute: (
    vehicleId: string,
    routeId: string,
    data: { name?: string; radiusMeters?: number; startLat?: number; startLon?: number; endLat?: number; endLon?: number },
  ) => request<PresetRoute>(`/vehicles/${vehicleId}/routes/${routeId}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteRoute: (vehicleId: string, routeId: string) =>
    request<void>(`/vehicles/${vehicleId}/routes/${routeId}`, { method: "DELETE" }),

  routeDetail: (vehicleId: string, routeId: string) =>
    request<PresetRouteDetail>(`/vehicles/${vehicleId}/routes/${routeId}`),

  // Un batch alla volta (vedi routes/user.ts) - "remaining" > 0 vuol dire richiamare
  // ancora per completare tutto lo storico.
  backfillAddresses: (vehicleId: string) =>
    // Corpo vuoto esplicito ("{}"): request() imposta sempre Content-Type: application/json,
    // e Fastify rifiuta con 400 un body realmente vuoto quando quel content-type e' dichiarato
    // (stesso motivo per cui heartbeat() manda {} invece di nessun body).
    request<{ scanned: number; updated: number; remaining: number }>(`/vehicles/${vehicleId}/backfill-addresses`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  // Un solo giro (vedi routes/user.ts) - a differenza di backfillAddresses non c'e' un
  // servizio esterno rate-limitato di mezzo, solo calcolo sulla traccia GPX gia' in DB.
  backfillEnergyKm: (vehicleId: string) =>
    request<{ scanned: number; updated: number }>(`/vehicles/${vehicleId}/backfill-energy-km`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};

export { ApiError };
