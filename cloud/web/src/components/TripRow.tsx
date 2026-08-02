import { Link } from "react-router-dom";
import type { TripSummary } from "../lib/types";
import { IconLocationPin, IconFlagCheckered } from "./icons";
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
        <p className="mt-1 text-xs text-onsurface-variant">
          {t(KIND_LABEL_KEY[trip.kind])} · {formatRange(trip.startedAt, trip.endedAt)}
        </p>
      </div>
      <div className="flex justify-between gap-4 text-sm tabular-nums sm:shrink-0 sm:justify-end sm:text-right">
        <div>
          <p className="text-onsurface-variant">{distanceUnit}</p>
          <p>{trip.km != null ? toDisplayDistance(trip.km, distanceUnit).toFixed(1) : "–"}</p>
        </div>
        <div>
          <p className="text-onsurface-variant">{t("trip.liters")}</p>
          <p>{trip.liters != null ? trip.liters.toFixed(2) : "–"}</p>
        </div>
        <div>
          <p className="text-onsurface-variant">{consumptionUnitLabel(distanceUnit, consumptionFormat)}</p>
          <p>{trip.avgConsumption != null ? toDisplayConsumption(trip.avgConsumption, distanceUnit, consumptionFormat).toFixed(1) : "–"}</p>
        </div>
      </div>
    </Link>
  );
}
