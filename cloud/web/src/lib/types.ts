export interface Vehicle {
  id: string;
  userId: string;
  vin: string;
  nickname: string;
  // Impostati dall'onboarding obbligatorio Android (VehicleCatalog.java) - null finche'
  // l'app non ha ancora inviato la prima sincronizzazione.
  brand: "JAECOO" | "OMODA" | null;
  model: string | null; // "5" | "7" | "8" | "9"
  powertrain: string | null; // "ICE_2WD" | "ICE_4WD" | "SHS_H" | "SHS_P" | "SHS_P_4WD" | "BEV"
  createdAt: string;
}

export interface TripSummary {
  id: string;
  kind: "auto" | "manual";
  startedAt: string;
  endedAt: string | null;
  label: string | null;
  startLabel: string | null;
  km: number | null;
  liters: number | null;
  avgConsumption: number | null;
  pctEv: number | null;
  pctSeries: number | null;
  pctParallel: number | null;
  pctOther: number | null;
  // Solo quando il trip arriva da GET /vehicles/:id/routes/:routeId di un percorso con
  // roundTrip abilitato (vedi PresetRoute) - mai persistito, calcolato al volo dal server in
  // base a quale estremo del percorso combacia con partenza/arrivo del trip.
  direction?: "outbound" | "return" | null;
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
  liters: number | null;
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

export interface AddressResult {
  lat: number;
  lon: number;
  displayName: string;
}

export interface PresetRoute {
  id: string;
  vehicleId: string;
  name: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  radiusMeters: number;
  roundTrip: boolean;
  createdAt: string;
}

export interface PresetRouteDetail {
  route: PresetRoute;
  trips: TripSummary[];
  stats: VehicleStats;
  counts: { outbound: number; return: number };
}

export interface VehicleCalendarStats {
  year: number;
  days: {
    date: string;
    km: number;
    liters: number;
    durationMin: number;
    tripCount: number;
    avgConsumption: number | null;
  }[];
}
