import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { api } from "../lib/api";
import type { VehicleStats } from "../lib/types";
import { BUCKET_COLOR, BUCKET_LABEL } from "../lib/energyFlow";
import { baseGridOptions, CHART_SURFACE, CHART_BORDER, CHART_TEXT_MUTED } from "../lib/chartTheme";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { Collapsible } from "./Collapsible";
import { hasElectricData } from "../lib/vehicleCatalog";
import { useLanguage } from "../lib/i18n/LanguageContext";

const DRIVE_MODE_COLOR = { ECO: "#2E7D32", NORMAL: "#00BFFF", SPORT: "#C62828" };

export function VehicleStatsPanel({
  vehicleId,
  powertrain,
  selectedDate,
  onSelectDate,
}: {
  vehicleId: string;
  powertrain: string | null;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const { t } = useLanguage();
  const [stats, setStats] = useState<VehicleStats | null>(null);

  useEffect(() => {
    setStats(null);
    api.stats(vehicleId).then(setStats);
  }, [vehicleId]);

  if (!stats) return <p className="mb-4 text-sm text-onsurface-variant">{t("stats.loading")}</p>;

  // Un'auto solo ICE non ha mai questi dati popolati (SyncWorker li esclude gia' dal
  // payload) - nascondiamo le sezioni invece di mostrare un donut/KPI vuoti o un
  // fuorviante "dati non ancora disponibili" per qualcosa che non arrivera' mai.
  const showElectric = hasElectricData(powertrain);

  return (
    <div className="mb-6 flex flex-col gap-4">
      <StatsBody stats={stats} showElectric={showElectric} />
      <CalendarHeatmap vehicleId={vehicleId} selectedDate={selectedDate} onSelectDate={onSelectDate} />
    </div>
  );
}

// Corpo delle statistiche senza il calendario ne' il fetch - estratto (2026-07-26) perche'
// serve identico anche per un sottoinsieme di trip (percorso preimpostato, o il range di
// date di un trip manuale - vedi jaedrive_todo #14/#15), dove un calendario annuale non ha
// senso (il periodo e' gia' arbitrario/ristretto). Il chiamante fa il fetch e passa lo
// `stats` gia' pronto.
export function StatsBody({ stats, showElectric }: { stats: VehicleStats; showElectric: boolean }) {
  const { t } = useLanguage();
  const { totals, energyFlowBreakdown, driveModeBreakdown, evHevKmSplit, consumptionTrend, bestTrip, worstTrip } = stats;
  const hasTrend = consumptionTrend.length >= 2;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t("stats.totalKm")} value={totals.km.toFixed(0)} />
        <Kpi label={t("stats.totalLiters")} value={totals.liters.toFixed(1)} />
        <Kpi label={t("stats.trips")} value={String(totals.tripCount)} />
        <Kpi label={t("stats.co2")} value={`${totals.co2Kg.toFixed(0)} kg`} />
      </div>

      {hasTrend && (
        <Collapsible id="consumptionTrend" title={t("stats.consumptionTrend")}>
          <ReactECharts
            option={{
              ...baseGridOptions,
              xAxis: { type: "category" as const, data: consumptionTrend.map((p) => p.date), axisLine: { lineStyle: { color: CHART_BORDER } }, axisLabel: { color: CHART_TEXT_MUTED, fontSize: 10 } },
              yAxis: { type: "value" as const, name: "km/l", axisLine: { show: false }, axisLabel: { color: CHART_TEXT_MUTED, fontSize: 11 }, splitLine: { lineStyle: { color: CHART_BORDER } } },
              series: [
                {
                  type: "line",
                  showSymbol: consumptionTrend.length < 40,
                  lineStyle: { width: 2, color: "#00BFFF" },
                  itemStyle: { color: "#00BFFF" },
                  areaStyle: { color: "#00BFFF", opacity: 0.1 },
                  data: consumptionTrend.map((p) => p.avgConsumption),
                },
              ],
            }}
            style={{ height: 220 }}
            notMerge
          />
        </Collapsible>
      )}

      <div className={`grid gap-4 ${showElectric ? "sm:grid-cols-2" : ""}`}>
        {showElectric && (
          <Donut
            id="energyBreakdown"
            title={t("stats.energyBreakdown")}
            noDataLabel={t("stats.noDataYet")}
            values={{ EV: energyFlowBreakdown.pctEv, SERIES: energyFlowBreakdown.pctSeries, PARALLEL: energyFlowBreakdown.pctParallel, CHR: energyFlowBreakdown.pctOther }}
            colorMap={BUCKET_COLOR}
            labelMap={BUCKET_LABEL}
          />
        )}
        <Donut
          id="driveModeBreakdown"
          title={t("stats.driveModeBreakdown")}
          noDataLabel={t("stats.noDataYet")}
          values={{ ECO: driveModeBreakdown.pctEco, NORMAL: driveModeBreakdown.pctNormal, SPORT: driveModeBreakdown.pctSport }}
          colorMap={DRIVE_MODE_COLOR}
        />
      </div>

      {showElectric && evHevKmSplit && (
        <div className="grid grid-cols-2 gap-3">
          <Kpi label={t("stats.kmElectric")} value={evHevKmSplit.kmEv.toFixed(0)} />
          <Kpi label={t("stats.kmHybrid")} value={evHevKmSplit.kmHev.toFixed(0)} />
        </div>
      )}

      {(bestTrip || worstTrip) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {bestTrip && <TripRefCard label={t("stats.bestTrip")} trip={bestTrip} tone="good" />}
          {worstTrip && <TripRefCard label={t("stats.worstTrip")} trip={worstTrip} tone="bad" />}
        </div>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-onsurface-variant">{label}</p>
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
}: {
  id: string;
  title: string;
  noDataLabel: string;
  values: Record<string, number | null>;
  colorMap: Record<string, string>;
  labelMap?: Record<string, string>;
}) {
  const entries = Object.entries(values).filter(([, v]) => v != null && v > 0) as [string, number][];
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface p-4">
        <p className="mb-1 text-sm font-medium">{title}</p>
        <p className="text-sm text-onsurface-variant">{noDataLabel}</p>
      </div>
    );
  }

  return (
    <Collapsible id={id} title={title}>
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
              // Le etichette sulla torta (con linea di richiamo) venivano troncate ("H...")
              // su contenitori stretti come una card mobile a piena larghezza - la legenda
              // qui sotto identifica gia' ogni fetta per intero, quindi disattivate invece
              // di provare a farci stare un testo lungo in poco spazio.
              label: { show: false },
              data: entries.map(([key, value]) => ({ name: labelMap?.[key] ?? key, value, itemStyle: { color: colorMap[key] } })),
            },
          ],
        }}
        style={{ height: 240 }}
        notMerge
      />
    </Collapsible>
  );
}

function TripRefCard({
  label,
  trip,
  tone,
}: {
  label: string;
  trip: { id: string; label: string | null; startedAt: string; avgConsumption: number | null; km: number | null; liters: number | null };
  tone: "good" | "bad";
}) {
  const { t, locale } = useLanguage();
  const border = tone === "good" ? "border-good hover:bg-good/10" : "border-bad hover:bg-bad/10";
  // avgConsumption null + liters===0 e' un viaggio con km reali ma zero carburante
  // consumato (tratto elettrico su un ibrido) - il caso migliore possibile, non un dato
  // mancante: km/l non e' rappresentabile (sarebbe infinito), quindi mostriamo un'etichetta
  // dedicata invece di "undefined km/l".
  const consumptionLabel = trip.avgConsumption != null
    ? `${trip.avgConsumption.toFixed(1)} km/l`
    : trip.liters === 0
      ? t("stats.allElectric")
      : "—";
  return (
    <Link to={`/trips/${trip.id}`} className={`rounded-lg border ${border} bg-surface p-4 transition`}>
      <p className="text-xs text-onsurface-variant">{label}</p>
      <p className="mt-1 font-medium">{trip.label ?? new Date(trip.startedAt).toLocaleDateString(locale)}</p>
      <p className="mt-1 text-sm tabular-nums text-onsurface-variant">
        {consumptionLabel} · {trip.km?.toFixed(1)} km
      </p>
    </Link>
  );
}
