export interface Vehicle {
  id: string;
  userId: string;
  vin: string;
  nickname: string;
  model: string | null;
  modelYear: number | null;
  createdAt: string;
}

export interface TripSummary {
  id: string;
  kind: "auto" | "manual_a" | "manual_b";
  startedAt: string;
  endedAt: string | null;
  label: string | null;
  km: number | null;
  liters: number | null;
  avgConsumption: number | null;
  pctEv: number | null;
  pctSeries: number | null;
  pctParallel: number | null;
  pctOther: number | null;
}

export interface TripDetail extends TripSummary {
  vehicleId: string;
  deviceId: string | null;
  gpxRaw: string | null;
  createdAt: string;
}

export interface TripsPage {
  total: number;
  page: number;
  pageSize: number;
  trips: TripSummary[];
}
