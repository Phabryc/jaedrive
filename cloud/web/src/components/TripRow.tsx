import { Link } from "react-router-dom";
import type { TripSummary } from "../lib/types";

const KIND_LABEL: Record<TripSummary["kind"], string> = {
  auto: "Percorso GPS",
  manual_a: "Trip A",
  manual_b: "Trip B",
};

function formatRange(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt);
  const dateStr = start.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  const startTime = start.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (!endedAt) return `${dateStr}, ${startTime} · in corso`;
  const endTime = new Date(endedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${dateStr}, ${startTime} - ${endTime}`;
}

export function TripRow({ trip }: { trip: TripSummary }) {
  return (
    <Link
      to={`/trips/${trip.id}`}
      className="flex items-center justify-between gap-4 rounded-lg border border-surface-border bg-surface px-4 py-3 transition hover:border-accent"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{trip.label ?? KIND_LABEL[trip.kind]}</p>
        <p className="text-xs text-onsurface-variant">
          {KIND_LABEL[trip.kind]} · {formatRange(trip.startedAt, trip.endedAt)}
        </p>
      </div>
      <div className="flex shrink-0 gap-4 text-right text-sm tabular-nums">
        <div>
          <p className="text-onsurface-variant">Km</p>
          <p>{trip.km != null ? trip.km.toFixed(1) : "–"}</p>
        </div>
        <div>
          <p className="text-onsurface-variant">Litri</p>
          <p>{trip.liters != null ? trip.liters.toFixed(2) : "–"}</p>
        </div>
        <div>
          <p className="text-onsurface-variant">Km/l</p>
          <p>{trip.avgConsumption != null ? trip.avgConsumption.toFixed(1) : "–"}</p>
        </div>
      </div>
    </Link>
  );
}
