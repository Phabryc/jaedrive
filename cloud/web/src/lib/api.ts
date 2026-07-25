import { auth } from "./firebase";
import type { Vehicle, TripDetail, TripsPage, VehicleStats, VehicleCalendarStats } from "./types";

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

  stats: (vehicleId: string, params: { from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<VehicleStats>(`/vehicles/${vehicleId}/stats${suffix}`);
  },

  statsCalendar: (vehicleId: string, year?: number) =>
    request<VehicleCalendarStats>(`/vehicles/${vehicleId}/stats/calendar${year ? `?year=${year}` : ""}`),

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
};

export { ApiError };
