import ReactECharts from "echarts-for-react";
import type { GpxPoint } from "../lib/gpx";
import { BUCKET_COLOR, BUCKET_LABEL } from "../lib/energyFlow";
import { DRIVE_MODE_COLOR, DRIVE_MODE_LABEL } from "../lib/driveMode";
import { computeRunSegments } from "../lib/segments";
import { baseGridOptions, yAxisMuted, CHART_ACCENT, CHART_ACCENT_SOFT, CHART_WARN } from "../lib/chartTheme";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { toDisplaySpeedKmh, speedUnitLabel, type DistanceUnit } from "../lib/units";

const CARD = "rounded-lg border border-surface-border bg-surface p-4";
const HEIGHT = 220;

interface TooltipParam {
  dataIndex: number;
  seriesName: string;
  marker: string;
  value: [number, number];
}

// Batteria e carburante condividono lo stesso asse 0-100% (unita' di misura identica) - le
// due misure NON vengono mai messe su assi diversi nello stesso grafico, vedi dataviz skill
// ("one axis", mai un asse Y doppio): velocita' e quota, che hanno scale diverse, hanno
// ciascuna il proprio grafico piu' sotto in questo stesso file.
//
// Integrato con la modalita' energia come fasce di sfondo (markArea) invece di una striscia
// separata: l'obiettivo (richiesto dall'utente) e' vedere a colpo d'occhio se un
// attacco/distacco dell'EV coincide con un certo livello di batteria, cosa che due widget
// separati non mostrerebbero senza dover incrociare manualmente le posizioni sull'asse X.
export function BatteryFuelChart({ points, distances, unit }: { points: GpxPoint[]; distances: number[]; unit: DistanceUnit }) {
  const { t } = useLanguage();
  const hasBattery = points.some((p) => p.batteryPct != null);
  const hasFuel = points.some((p) => p.fuelPct != null);
  if (!hasBattery && !hasFuel) return null;

  const batteryName = t("charts.battery");
  const fuelName = t("charts.fuel");

  const bucketSegments = computeRunSegments(distances, points.map((p) => p.bucket));
  const presentBuckets = Array.from(new Set(bucketSegments.map((s) => s.value)));
  const markArea = {
    silent: true,
    itemStyle: { opacity: 0.14 },
    data: bucketSegments.map((s) => [
      { xAxis: s.from, itemStyle: { color: BUCKET_COLOR[s.value] } },
      { xAxis: s.to },
    ]),
  };

  const option = {
    ...baseGridOptions,
    legend: { data: [batteryName, fuelName].filter((n) => (n === batteryName ? hasBattery : hasFuel)), top: 0, textStyle: { color: "#BCC8D1", fontSize: 11 } },
    grid: { ...baseGridOptions.grid, top: 28 },
    xAxis: { ...baseGridOptions.xAxis, name: unit },
    yAxis: { ...yAxisMuted, min: 0, max: 100, name: "%" },
    tooltip: {
      ...baseGridOptions.tooltip,
      formatter: (params: TooltipParam[]) => {
        if (!params.length) return "";
        const idx = params[0].dataIndex;
        const lines = params.map((p) => `${p.marker} ${p.seriesName}: ${p.value[1]?.toFixed(0) ?? "–"}%`);
        const bucket = points[idx]?.bucket;
        if (bucket) {
          lines.push(
            `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${BUCKET_COLOR[bucket]};margin-right:4px;"></span>${t("charts.modeTooltipPrefix")}${BUCKET_LABEL[bucket]}`,
          );
        }
        return `${distances[idx]?.toFixed(1) ?? "0"} ${unit}<br/>${lines.join("<br/>")}`;
      },
    },
    series: [
      hasBattery && {
        name: batteryName,
        type: "line",
        showSymbol: false,
        lineStyle: { width: 2, color: CHART_ACCENT_SOFT },
        itemStyle: { color: CHART_ACCENT_SOFT },
        data: points.map((p, i) => [distances[i], p.batteryPct]),
        markArea,
      },
      hasFuel && {
        name: fuelName,
        type: "line",
        showSymbol: false,
        lineStyle: { width: 2, color: CHART_WARN },
        itemStyle: { color: CHART_WARN },
        data: points.map((p, i) => [distances[i], p.fuelPct]),
        // markArea va su una sola serie (renderebbe due volte altrimenti) - sulla batteria
        // se presente, altrimenti sul carburante.
        ...(hasBattery ? {} : { markArea }),
      },
    ].filter(Boolean),
  };

  return (
    <div className={CARD}>
      <p className="mb-1 text-sm font-medium">{t("charts.batteryFuelTitle")}</p>
      <p className="mb-1 text-xs text-onsurface-variant">{t("charts.batteryFuelHint")}</p>
      <ReactECharts option={option} style={{ height: HEIGHT }} notMerge />
      {presentBuckets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-onsurface-variant">
          {presentBuckets.map((b) => (
            <span key={b} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BUCKET_COLOR[b] }} />
              {BUCKET_LABEL[b]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SpeedChart({ points, distances, unit }: { points: GpxPoint[]; distances: number[]; unit: DistanceUnit }) {
  const { t } = useLanguage();
  if (!points.some((p) => p.speedKmh != null)) return null;

  const option = {
    ...baseGridOptions,
    xAxis: { ...baseGridOptions.xAxis, name: unit },
    yAxis: { ...yAxisMuted, name: speedUnitLabel(unit), min: 0 },
    series: [
      {
        name: t("charts.speed"),
        type: "line",
        showSymbol: false,
        lineStyle: { width: 2, color: CHART_ACCENT },
        areaStyle: { color: CHART_ACCENT, opacity: 0.12 },
        itemStyle: { color: CHART_ACCENT },
        data: points.map((p, i) => [distances[i], p.speedKmh != null ? toDisplaySpeedKmh(p.speedKmh, unit) : null]),
      },
    ],
  };

  return (
    <div className={CARD}>
      <p className="mb-1 text-sm font-medium">{t("charts.speed")}</p>
      <ReactECharts option={option} style={{ height: HEIGHT }} notMerge />
    </div>
  );
}

// Sfondo colorato per modalita' di guida (ECO/NORMAL/SPORT), stessa tecnica delle markArea
// di BatteryFuelChart - l'utente vuole vedere se un tratto in salita/discesa coincide con
// una certa modalita' di guida.
export function ElevationChart({ points, distances, unit }: { points: GpxPoint[]; distances: number[]; unit: DistanceUnit }) {
  const { t } = useLanguage();
  if (!points.some((p) => p.ele != null)) return null;

  const modeSegments = computeRunSegments(distances, points.map((p) => (p.driveMode != null ? String(p.driveMode) : null)));
  const presentModes = Array.from(new Set(modeSegments.map((s) => s.value)));
  const markArea = {
    silent: true,
    itemStyle: { opacity: 0.14 },
    data: modeSegments.map((s) => [
      { xAxis: s.from, itemStyle: { color: DRIVE_MODE_COLOR[s.value as "0" | "1" | "2"] } },
      { xAxis: s.to },
    ]),
  };

  const option = {
    ...baseGridOptions,
    xAxis: { ...baseGridOptions.xAxis, name: unit },
    yAxis: { ...yAxisMuted, name: "m" },
    tooltip: {
      ...baseGridOptions.tooltip,
      formatter: (params: TooltipParam[]) => {
        if (!params.length) return "";
        const idx = params[0].dataIndex;
        const lines = params.map((p) => `${p.marker} ${p.seriesName}: ${p.value[1]?.toFixed(0) ?? "–"} m`);
        const mode = points[idx]?.driveMode;
        if (mode != null) {
          const key = String(mode) as "0" | "1" | "2";
          lines.push(
            `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${DRIVE_MODE_COLOR[key]};margin-right:4px;"></span>${t("charts.modeTooltipPrefix")}${DRIVE_MODE_LABEL[key]}`,
          );
        }
        return `${distances[idx]?.toFixed(1) ?? "0"} ${unit}<br/>${lines.join("<br/>")}`;
      },
    },
    series: [
      {
        name: t("charts.elevationSeries"),
        type: "line",
        showSymbol: false,
        lineStyle: { width: 2, color: CHART_ACCENT_SOFT },
        areaStyle: { color: CHART_ACCENT_SOFT, opacity: 0.12 },
        itemStyle: { color: CHART_ACCENT_SOFT },
        data: points.map((p, i) => [distances[i], p.ele]),
        markArea,
      },
    ],
  };

  return (
    <div className={CARD}>
      <p className="mb-1 text-sm font-medium">{t("charts.elevationTitle")}</p>
      <p className="mb-1 text-xs text-onsurface-variant">{t("charts.elevationHint")}</p>
      <ReactECharts option={option} style={{ height: HEIGHT }} notMerge />
      {presentModes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-onsurface-variant">
          {presentModes.map((m) => (
            <span key={m} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DRIVE_MODE_COLOR[m as "0" | "1" | "2"] }} />
              {DRIVE_MODE_LABEL[m as "0" | "1" | "2"]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
