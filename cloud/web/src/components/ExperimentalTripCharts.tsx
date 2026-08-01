import ReactECharts from "echarts-for-react";
import type { GpxPoint } from "../lib/gpx";
import { baseGridOptions, yAxisMuted, CHART_TEXT_MUTED } from "../lib/chartTheme";
import { useLanguage } from "../lib/i18n/LanguageContext";
import type { DistanceUnit } from "../lib/units";

// Consumo istantaneo e livello di rigenerazione: segnali VDB reali ma con scala/unita' NON
// confermate sul campo (vedi VDInfoClient.java, Android) - mostrati qui come valori grezzi,
// in una sezione separata e chiaramente etichettata, invece che tra i grafici principali,
// per non lasciar intendere una precisione/unita' che non e' stata verificata. Coerente con
// la regola del progetto di non nascondere dati diagnostici ma di non inventarne il
// significato - stesso spirito della vecchia card "VDB CAR_INFO (sperimentale)" in app.
export function ExperimentalTripCharts({ points, distances, unit }: { points: GpxPoint[]; distances: number[]; unit: DistanceUnit }) {
  const { t } = useLanguage();
  const hasConsumption = points.some((p) => p.instConsumption != null);
  const hasRegen = points.some((p) => p.regenLevel != null);
  if (!hasConsumption && !hasRegen) return null;

  const mkOption = (data: (number | null)[]) => ({
    ...baseGridOptions,
    grid: { ...baseGridOptions.grid, top: 8 },
    xAxis: { ...baseGridOptions.xAxis, name: unit },
    yAxis: { ...yAxisMuted, name: "" },
    series: [
      {
        type: "line",
        showSymbol: false,
        lineStyle: { width: 2, color: CHART_TEXT_MUTED },
        itemStyle: { color: CHART_TEXT_MUTED },
        data: distances.map((d, i) => [d, data[i]]),
      },
    ],
  });

  return (
    <details className="rounded-lg border border-surface-border bg-surface p-4">
      <summary className="cursor-pointer text-sm font-medium text-onsurface-variant">{t("charts.experimentalTitle")}</summary>
      <div className="mt-3 flex flex-col gap-4">
        {hasConsumption && (
          <div>
            <p className="mb-1 text-xs text-onsurface-variant">{t("charts.instConsumption")}</p>
            <ReactECharts
              option={mkOption(points.map((p) => p.instConsumption))}
              style={{ height: 140 }}
              notMerge
            />
          </div>
        )}
        {hasRegen && (
          <div>
            <p className="mb-1 text-xs text-onsurface-variant">{t("charts.regenLevel")}</p>
            <ReactECharts option={mkOption(points.map((p) => p.regenLevel))} style={{ height: 140 }} notMerge />
          </div>
        )}
      </div>
    </details>
  );
}
