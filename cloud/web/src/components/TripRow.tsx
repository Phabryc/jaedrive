import { Link } from "react-router-dom";
import type { TripSummary } from "../lib/types";
import { IconLocationPin, IconFlagCheckered } from "./icons";
import { useLanguage, type TranslationKey } from "../lib/i18n/LanguageContext";

const KIND_LABEL_KEY: Record<TripSummary["kind"], TranslationKey> = {
  auto: "trip.kindAuto",
  manual: "trip.kindManual",
};

export function TripRow({ trip }: { trip: TripSummary }) {
  const { t, locale } = useLanguage();

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
      className="flex items-center justify-between gap-4 rounded-lg border border-surface-border bg-surface px-4 py-3 transition hover:border-accent"
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
      <div className="flex shrink-0 gap-4 text-right text-sm tabular-nums">
        <div>
          <p className="text-onsurface-variant">{t("trip.km")}</p>
          <p>{trip.km != null ? trip.km.toFixed(1) : "–"}</p>
        </div>
        <div>
          <p className="text-onsurface-variant">{t("trip.liters")}</p>
          <p>{trip.liters != null ? trip.liters.toFixed(2) : "–"}</p>
        </div>
        <div>
          <p className="text-onsurface-variant">{t("trip.kmPerL")}</p>
          <p>{trip.avgConsumption != null ? trip.avgConsumption.toFixed(1) : "–"}</p>
        </div>
      </div>
    </Link>
  );
}
