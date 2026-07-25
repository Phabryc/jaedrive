import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { TripDetail as TripDetailType } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { TripMap } from "../components/TripMap";
import { BUCKET_COLOR, type EnergyBucket } from "../lib/energyFlow";
import { parseGpxPoints, cumulativeDistanceKm } from "../lib/gpx";
import { BatteryFuelChart, SpeedChart, ElevationChart } from "../components/TripTimelineCharts";
import { ExperimentalTripCharts } from "../components/ExperimentalTripCharts";
import { CategoryBand } from "../components/CategoryBand";

const DRIVE_MODE_COLOR: Record<string, string> = { "0": "#2E7D32", "1": "#00BFFF", "2": "#C62828" };
const DRIVE_MODE_LABEL: Record<string, string> = { "0": "ECO", "1": "NORMAL", "2": "SPORT" };

const KIND_LABEL: Record<TripDetailType["kind"], string> = {
  auto: "Percorso GPS",
  manual_a: "Trip A",
  manual_b: "Trip B",
};

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetailType | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) api.trip(id).then(setTrip);
  }, [id]);

  // Calcolati sempre (regole degli hook: mai dopo un return condizionale) - vuoti finche'
  // il trip non e' ancora caricato o non ha una traccia GPX (es. viaggio manuale).
  const points = useMemo(() => (trip?.gpxRaw ? parseGpxPoints(trip.gpxRaw) : []), [trip?.gpxRaw]);
  const distancesKm = useMemo(() => cumulativeDistanceKm(points), [points]);

  async function handleDelete() {
    if (!trip || !confirm("Eliminare questo viaggio? L'operazione non può essere annullata.")) return;
    setDeleting(true);
    await api.deleteTrip(trip.id);
    navigate(-1);
  }

  if (!trip) {
    return (
      <AppShell>
        <p className="text-onsurface-variant">Caricamento...</p>
      </AppShell>
    );
  }

  const breakdown = [
    { key: "EV", value: trip.pctEv },
    { key: "SERIES", value: trip.pctSeries },
    { key: "PARALLEL", value: trip.pctParallel },
    { key: "CHR", value: trip.pctOther },
  ] as const;
  const hasBreakdown = breakdown.some((b) => b.value != null && b.value > 0);

  return (
    <AppShell>
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-onsurface-variant hover:text-onsurface">
        ← Indietro
      </button>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{trip.label ?? KIND_LABEL[trip.kind]}</h1>
          <p className="text-sm text-onsurface-variant">
            {KIND_LABEL[trip.kind]} · {new Date(trip.startedAt).toLocaleString("it-IT")}
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md border border-bad px-3 py-1.5 text-sm text-bad hover:bg-bad/10 disabled:opacity-50"
        >
          Elimina
        </button>
      </div>

      {trip.gpxRaw && <TripMap gpxRaw={trip.gpxRaw} />}

      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-3">
        <Stat label="Km percorsi" value={trip.km != null ? trip.km.toFixed(1) : "–"} />
        <Stat label="Litri" value={trip.liters != null ? trip.liters.toFixed(2) : "–"} />
        <Stat label="Consumo medio" value={trip.avgConsumption != null ? `${trip.avgConsumption.toFixed(1)} km/l` : "–"} />
      </div>

      {hasBreakdown && (
        <div className="mt-4 rounded-lg border border-surface-border bg-surface p-4">
          <p className="mb-3 text-sm font-medium">Ripartizione energia</p>
          <div className="flex h-3 overflow-hidden rounded-full">
            {breakdown.map((b) => (
              <div
                key={b.key}
                style={{ width: `${b.value ?? 0}%`, backgroundColor: BUCKET_COLOR[b.key] }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-onsurface-variant">
            {breakdown.map((b) => (
              <span key={b.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BUCKET_COLOR[b.key] }} />
                {b.key} {b.value != null ? `${b.value.toFixed(0)}%` : "–"}
              </span>
            ))}
          </div>
        </div>
      )}

      {points.length > 1 && (
        <div className="mt-4 flex flex-col gap-4">
          <CategoryBand<EnergyBucket>
            title="Modalità energia nel tempo"
            distancesKm={distancesKm}
            values={points.map((p) => p.bucket)}
            colorMap={BUCKET_COLOR}
            labelMap={{ EV: "EV", SERIES: "SERIES", PARALLEL: "PARALLEL", CHR: "CHR", IDLE: "IDLE" }}
          />
          <CategoryBand
            title="Modalità di guida"
            distancesKm={distancesKm}
            values={points.map((p) => (p.driveMode != null ? String(p.driveMode) : null))}
            colorMap={DRIVE_MODE_COLOR}
            labelMap={DRIVE_MODE_LABEL}
          />
          <BatteryFuelChart points={points} distancesKm={distancesKm} />
          <SpeedChart points={points} distancesKm={distancesKm} />
          <ElevationChart points={points} distancesKm={distancesKm} />
          <ExperimentalTripCharts points={points} distancesKm={distancesKm} />
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-onsurface-variant">{label}</p>
    </div>
  );
}
