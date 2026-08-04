import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { api } from "../lib/api";
import type { VehicleStats } from "../lib/types";
import { BUCKET_COLOR, BUCKET_LABEL } from "../lib/energyFlow";
import { baseGridOptions, CHART_SURFACE, CHART_BORDER, CHART_TEXT_MUTED } from "../lib/chartTheme";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { Collapsible } from "./Collapsible";
import { IconRoute, IconFuel, IconFlagCheckered, IconGauge, IconBattery } from "./icons";
import { hasElectricData } from "../lib/vehicleCatalog";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { useUnits } from "../lib/UnitsContext";
import { formatDistance, toDisplayDistance, toDisplayConsumption, consumptionUnitLabel, formatConsumptionOrElectric } from "../lib/units";

const DRIVE_MODE_COLOR = { ECO: "#2E7D32", NORMAL: "#00BFFF", SPORT: "#C62828" };

// Griglia condivisa da tutti i punti in cui compaiono i widget statistiche - qui (pagina
// veicolo, con calendario) e nei due sottoinsiemi senza calendario (percorso preimpostato,
// range di un trip manuale - vedi RouteDetail.tsx/TripDetail.tsx). "dense" cosi' un widget
// piccolo dopo uno grande (es. gli ultimi due KPI dopo il grafico trend) risale a riempire
// lo spazio lasciato libero sulla riga, invece di aprirne sempre una nuova.
export const STATS_GRID_CLASS = "grid grid-cols-12 items-start gap-4 grid-flow-dense";

export function VehicleStatsPanel({
  vehicleId,
  powertrain,
  rangeFrom,
  rangeTo,
  onRangeChange,
}: {
  vehicleId: string;
  powertrain: string | null;
  // Periodo attivo (date "YYYY-MM-DD", entrambe opzionali) - sollevato da Trips.tsx cosi'
  // lo stesso filtro applicato alla lista viaggi si riflette anche qui, invece di mostrare
  // sempre le statistiche di tutta la vita del veicolo. Scelto interamente dal calendario
  // qui sotto (vedi CalendarHeatmap - click singolo o modalita' "Periodo").
  rangeFrom: string | null;
  rangeTo: string | null;
  onRangeChange: (from: string | null, to: string | null) => void;
}) {
  const { t, locale } = useLanguage();
  const [stats, setStats] = useState<VehicleStats | null>(null);
  const fromIso = rangeFrom ? `${rangeFrom}T00:00:00.000Z` : undefined;
  const toIso = rangeTo ? `${rangeTo}T23:59:59.999Z` : undefined;

  useEffect(() => {
    setStats(null);
    api.stats(vehicleId, { from: fromIso, to: toIso }).then(setStats);
  }, [vehicleId, fromIso, toIso]);

  // Un'auto solo ICE non ha mai questi dati popolati (SyncWorker li esclude gia' dal
  // payload) - nascondiamo le sezioni invece di mostrare un donut/KPI vuoti o un
  // fuorviante "dati non ancora disponibili" per qualcosa che non arrivera' mai.
  const showElectric = hasElectricData(powertrain);

  function formatDay(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  }
  const rangeLabel = !rangeFrom
    ? null
    : rangeFrom === rangeTo
      ? formatDay(rangeFrom)
      : rangeTo
        ? `${formatDay(rangeFrom)} → ${formatDay(rangeTo)}`
        : formatDay(rangeFrom);

  const calendarNode = (
    <CalendarHeatmap
      className="order-1 col-span-12 xl:order-none xl:col-span-4 xl:self-stretch"
      vehicleId={vehicleId}
      rangeFrom={rangeFrom}
      rangeTo={rangeTo}
      onRangeChange={onRangeChange}
    />
  );

  return (
    <>
      {rangeLabel && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn bg-warn/10 px-4 py-2 text-sm text-warn">
          <span>{t("stats.rangeActive", { range: rangeLabel })}</span>
          <button
            onClick={() => onRangeChange(null, null)}
            className="rounded border border-warn px-2 py-0.5 text-xs hover:bg-warn/20"
          >
            ✕ {t("stats.rangeClear")}
          </button>
        </div>
      )}
      <div className={`mb-6 ${STATS_GRID_CLASS}`}>
        {stats ? (
          <StatsBody stats={stats} showElectric={showElectric} calendar={calendarNode} />
        ) : (
          <>
            <p className="col-span-12 text-sm text-onsurface-variant">{t("stats.loading")}</p>
            {calendarNode}
          </>
        )}
      </div>
    </>
  );
}

export function StatsBody({
  stats,
  showElectric,
  calendar,
}: {
  stats: VehicleStats;
  showElectric: boolean;
  calendar?: ReactNode;
}) {
  const { t } = useLanguage();
  const { distanceUnit, consumptionFormat } = useUnits();
  const { totals, energyFlowBreakdown, driveModeBreakdown, evHevKmSplit, consumptionTrend, bestTrip, worstTrip } = stats;
  const hasTrend = consumptionTrend.length >= 2;
  const kpiSpan = "col-span-6 sm:col-span-3 xl:col-span-2";

  return (
    <>
      <Kpi className={kpiSpan} icon={<IconRoute size={18} />} label={t("stats.totalKm")} value={toDisplayDistance(totals.km, distanceUnit).toFixed(0)} />
      <Kpi className={kpiSpan} icon={<IconFuel size={18} />} label={t("stats.totalLiters")} value={totals.liters.toFixed(1)} />
      <Kpi className={kpiSpan} icon={<IconFlagCheckered size={18} />} label={t("stats.trips")} value={String(totals.tripCount)} />
      <Kpi className={kpiSpan} label={t("stats.co2")} value={`${totals.co2Kg.toFixed(0)} kg`} />
      {showElectric && evHevKmSplit && (
        <>
          <Kpi className={kpiSpan} icon={<IconBattery size={18} />} label={t("stats.kmElectric")} value={toDisplayDistance(evHevKmSplit.kmEv, distanceUnit).toFixed(0)} />
          <Kpi className={kpiSpan} icon={<IconGauge size={18} />} label={t("stats.kmHybrid")} value={toDisplayDistance(evHevKmSplit.kmHev, distanceUnit).toFixed(0)} />
        </>
      )}

      {hasTrend && (
        <Collapsible className="order-2 col-span-12 xl:order-none xl:col-span-8 xl:self-stretch flex flex-col" id="consumptionTrend" title={t("stats.consumptionTrend")}>
          <div className="flex-1 min-h-[220px] w-full">
            <ReactECharts
              option={{
                ...baseGridOptions,
                xAxis: { type: "category" as const, data: consumptionTrend.map((p) => p.date), axisLine: { lineStyle: { color: CHART_BORDER } }, axisLabel: { color: CHART_TEXT_MUTED, fontSize: 10 } },
                yAxis: { type: "value" as const, name: consumptionUnitLabel(distanceUnit, consumptionFormat), axisLine: { show: false }, axisLabel: { color: CHART_TEXT_MUTED, fontSize: 11 }, splitLine: { lineStyle: { color: CHART_BORDER } } },
                series: [
                  {
                    type: "line",
                    showSymbol: consumptionTrend.length < 40,
                    lineStyle: { width: 2, color: "#00BFFF" },
                    itemStyle: { color: "#00BFFF" },
                    areaStyle: { color: "#00BFFF", opacity: 0.1 },
                    data: consumptionTrend.map((p) => toDisplayConsumption(p.avgConsumption, distanceUnit, consumptionFormat)),
                  },
                ],
              }}
              style={{ height: "100%", minHeight: 220 }}
              notMerge
            />
          </div>
        </Collapsible>
      )}

      {calendar}

      {showElectric && (
        <Donut
          className="order-3 col-span-12 sm:col-span-6 xl:order-none xl:col-span-4 xl:self-stretch flex flex-col"
          id="energyBreakdown"
          title={t("stats.energyBreakdown")}
          noDataLabel={t("stats.noDataYet")}
          values={{ EV: energyFlowBreakdown.pctEv, SERIES: energyFlowBreakdown.pctSeries, PARALLEL: energyFlowBreakdown.pctParallel, CHR: energyFlowBreakdown.pctOther }}
          colorMap={BUCKET_COLOR}
          labelMap={BUCKET_LABEL}
        />
      )}
      <Donut
        className={`order-3 col-span-12 sm:col-span-6 ${showElectric ? "xl:col-span-4" : "xl:col-span-8"} xl:order-none xl:self-stretch flex flex-col`}
        id="driveModeBreakdown"
        title={t("stats.driveModeBreakdown")}
        noDataLabel={t("stats.noDataYet")}
        values={{ ECO: driveModeBreakdown.pctEco, NORMAL: driveModeBreakdown.pctNormal, SPORT: driveModeBreakdown.pctSport }}
        colorMap={DRIVE_MODE_COLOR}
      />

      {bestTrip && <TripRefCard className="order-4 col-span-12 sm:col-span-6 xl:order-none" label={t("stats.bestTrip")} trip={bestTrip} tone="good" />}
      {worstTrip && <TripRefCard className="order-4 col-span-12 sm:col-span-6 xl:order-none" label={t("stats.worstTrip")} trip={worstTrip} tone="bad" />}
    </>
  );
}

function Kpi({
  label,
  value,
  icon,
  className = "",
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border border-surface-border bg-surface p-4 ${className}`.trim()}>
      {icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
        <p className="truncate text-xs text-onsurface-variant">{label}</p>
      </div>
    </div>
  );
}

function Donut({
  id,
  title,
  noDataLabel,
  values,
  colorMap,
  labelMap,
  className = "",
}: {
  id: string;
  title: string;
  noDataLabel: string;
  values: Record<string, number | null>;
  colorMap: Record<string, string>;
  labelMap?: Record<string, string>;
  className?: string;
}) {
  const entries = Object.entries(values).filter(([, v]) => v != null && v > 0) as [string, number][];
  if (entries.length === 0) {
    return (
      <div className={`rounded-lg border border-surface-border bg-surface p-4 ${className}`.trim()}>
        <p className="mb-1 text-sm font-medium">{title}</p>
        <p className="text-sm text-onsurface-variant">{noDataLabel}</p>
      </div>
    );
  }

  return (
    <Collapsible className={className} id={id} title={title}>
      <div className="flex-1 min-h-[200px] w-full">
        <ReactECharts
          option={{
            backgroundColor: "transparent",
            textStyle: { color: "#E5E2E1", fontFamily: "Inter, system-ui, sans-serif" },
            tooltip: {
              trigger: "item",
              backgroundColor: CHART_SURFACE,
              borderColor: CHART_BORDER,
              textStyle: { color: "#E5E2E1" },
              formatter: (p: { name: string; value: number }) => `${p.name}: ${p.value.toFixed(0)}%`,
            },
            legend: { bottom: 0, textStyle: { color: CHART_TEXT_MUTED, fontSize: 11 } },
            series: [
              {
                type: "pie",
                radius: ["45%", "70%"],
                center: ["50%", "42%"],
                itemStyle: { borderColor: "#0A0A0A", borderWidth: 2 },
                label: { show: false },
                data: entries.map(([key, value]) => ({ name: labelMap?.[key] ?? key, value, itemStyle: { color: colorMap[key] } })),
              },
            ],
          }}
          style={{ height: "100%", minHeight: 200 }}
          notMerge
        />
      </div>
    </Collapsible>
  );
}

function TripRefCard({
  label,
  trip,
  tone,
  className = "",
}: {
  label: string;
  trip: { id: string; label: string | null; startedAt: string; avgConsumption: number | null; km: number | null; liters: number | null };
  tone: "good" | "bad";
  className?: string;
}) {
  const { t, locale } = useLanguage();
  const { distanceUnit, consumptionFormat } = useUnits();
  const border = tone === "good" ? "border-good hover:bg-good/10" : "border-bad hover:bg-bad/10";
  // avgConsumption null + liters===0 e' un viaggio con km reali ma zero carburante
  // consumato (tratto elettrico su un ibrido) - il caso migliore possibile, non un dato
  // mancante: in formato "ratio" (km/l o mpg) non e' rappresentabile (sarebbe infinito),
  // quindi mostriamo un'etichetta dedicata invece di "undefined km/l" - vedi
  // formatConsumptionOrElectric (in formato "l100" invece E' rappresentabile, 0.0).
  const consumptionLabel = formatConsumptionOrElectric(
    trip.avgConsumption, trip.liters, distanceUnit, consumptionFormat, t("stats.allElectric"),
  );
  return (
    <Link to={`/trips/${trip.id}`} className={`rounded-lg border ${border} bg-surface p-4 transition ${className}`.trim()}>
      <p className="text-xs text-onsurface-variant">{label}</p>
      <p className="mt-1 font-medium">{trip.label ?? new Date(trip.startedAt).toLocaleDateString(locale)}</p>
      <p className="mt-1 text-sm tabular-nums text-onsurface-variant">
        {consumptionLabel} · {trip.km != null ? formatDistance(trip.km, distanceUnit) : "–"}
      </p>
    </Link>
  );
}
