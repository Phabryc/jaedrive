import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TripSummary } from "../lib/types";
import { IconLocationPin, IconFlagCheckered, IconRoute, IconFuel, IconGauge } from "./icons";
import { useLanguage, type TranslationKey } from "../lib/i18n/LanguageContext";
import { useUnits } from "../lib/UnitsContext";
import { toDisplayDistance, toDisplayConsumption, consumptionUnitLabel } from "../lib/units";

const KIND_LABEL_KEY: Record<TripSummary["kind"], TranslationKey> = {
  auto: "trip.kindAuto",
  manual: "trip.kindManual",
};

export function TripRow({ trip }: { trip: TripSummary }) {
  const { t, locale } = useLanguage();
  const { distanceUnit, consumptionFormat } = useUnits();

  function formatRange(startedAt: string, endedAt: string | null): string {
    const start = new Date(startedAt);
    const dateStr = start.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
    const startTime = start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    if (!endedAt) return `${dateStr}, ${startTime} · ${t("trip.ongoing")}`;
    const endTime = new Date(endedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    return `${dateStr}, ${startTime} - ${endTime}`;
  }

  return (
    <Link
      to={`/trips/${trip.id}`}
      className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface px-4 py-3 transition hover:border-accent sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="min-w-0">
        {trip.startLabel || trip.label ? (
          <div className="flex flex-col gap-0.5">
            {trip.startLabel && (
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                <IconLocationPin size={13} className="shrink-0 text-accent" />
                <span className="truncate">{trip.startLabel}</span>
              </p>
            )}
            {trip.label && (
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                <span className="shrink-0"><IconFlagCheckered size={13} /></span>
                <span className="truncate">{trip.label}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="truncate font-medium">{t(KIND_LABEL_KEY[trip.kind])}</p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-onsurface-variant">
          <span>
            {t(KIND_LABEL_KEY[trip.kind])} · {formatRange(trip.startedAt, trip.endedAt)}
          </span>
          {trip.direction && (
            <span className="rounded-full border border-surface-border px-1.5 py-0.5 text-[10px] text-onsurface-variant">
              {t(trip.direction === "outbound" ? "routeDetail.directionOutbound" : "routeDetail.directionReturn")}
            </span>
          )}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm tabular-nums sm:flex sm:shrink-0">
        <StatBox
          icon={<IconRoute size={14} />}
          value={trip.km != null ? toDisplayDistance(trip.km, distanceUnit).toFixed(1) : "–"}
          unit={distanceUnit}
        />
        <StatBox
          icon={<IconFuel size={14} />}
          value={trip.liters != null ? trip.liters.toFixed(2) : "–"}
          unit={t("trip.liters")}
        />
        <StatBox
          icon={<IconGauge size={14} />}
          value={trip.avgConsumption != null ? toDisplayConsumption(trip.avgConsumption, distanceUnit, consumptionFormat).toFixed(1) : "–"}
          unit={consumptionUnitLabel(distanceUnit, consumptionFormat)}
        />
      </div>
    </Link>
  );
}

function StatBox({ icon, value, unit }: { icon: ReactNode; value: string; unit: string }) {
  return (
    <div className="flex h-11 items-center gap-2 rounded-md border border-surface-border bg-bg/40 px-2.5 py-1 sm:w-28 sm:shrink-0">
      <span className="shrink-0 text-onsurface-variant">{icon}</span>
      <div className="min-w-0 flex-1 text-center leading-tight">
        <p className="truncate text-sm font-medium">{value}</p>
        <p className="truncate text-[10px] text-onsurface-variant">{unit}</p>
      </div>
    </div>
  );
}
