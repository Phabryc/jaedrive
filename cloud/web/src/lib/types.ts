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
  pctEco: number | null;
  pctNormal: number | null;
  pctSport: number | null;
  kmEv: number | null;
  kmHev: number | null;
}

export interface TripsPage {
  total: number;
  page: number;
  pageSize: number;
  trips: TripSummary[];
}

export interface TripStatsRef {
  id: string;
  label: string | null;
  startedAt: string;
  avgConsumption: number | null;
  km: number | null;
}

export interface VehicleStats {
  totals: { km: number; liters: number; tripCount: number; co2Kg: number };
  energyFlowBreakdown: { pctEv: number | null; pctSeries: number | null; pctParallel: number | null; pctOther: number | null };
  driveModeBreakdown: { pctEco: number | null; pctNormal: number | null; pctSport: number | null };
  evHevKmSplit: { kmEv: number; kmHev: number } | null;
  kindBreakdown: Record<string, { count: number; km: number }>;
  consumptionTrend: { date: string; avgConsumption: number }[];
  bestTrip: TripStatsRef | null;
  worstTrip: TripStatsRef | null;
}

export interface VehicleCalendarStats {
  year: number;
  days: { date: string; km: number; tripCount: number }[];
}
