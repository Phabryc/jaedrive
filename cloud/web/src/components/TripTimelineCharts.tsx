import ReactECharts from "echarts-for-react";
import type { GpxPoint } from "../lib/gpx";
import { baseGridOptions, yAxisMuted, CHART_ACCENT, CHART_ACCENT_SOFT, CHART_WARN } from "../lib/chartTheme";

const CARD = "rounded-lg border border-surface-border bg-surface p-4";
const HEIGHT = 220;

// Batteria e carburante condividono lo stesso asse 0-100% (unita' di misura identica) - le
// due misure NON vengono mai messe su assi diversi nello stesso grafico, vedi dataviz skill
// ("one axis", mai un asse Y doppio): velocita' e quota, che hanno scale diverse, hanno
// ciascuna il proprio grafico piu' sotto in questo stesso file.
export function BatteryFuelChart({ points, distancesKm }: { points: GpxPoint[]; distancesKm: number[] }) {
  const hasBattery = points.some((p) => p.batteryPct != null);
  const hasFuel = points.some((p) => p.fuelPct != null);
  if (!hasBattery && !hasFuel) return null;

  const option = {
    ...baseGridOptions,
    legend: { data: ["Batteria", "Carburante"].filter((n) => (n === "Batteria" ? hasBattery : hasFuel)), top: 0, textStyle: { color: "#BCC8D1", fontSize: 11 } },
    grid: { ...baseGridOptions.grid, top: 28 },
    yAxis: { ...yAxisMuted, min: 0, max: 100, name: "%" },
    series: [
      hasBattery && {
        name: "Batteria",
        type: "line",
        showSymbol: false,
        lineStyle: { width: 2, color: CHART_ACCENT_SOFT },
        itemStyle: { color: CHART_ACCENT_SOFT },
        data: points.map((p, i) => [distancesKm[i], p.batteryPct]),
      },
      hasFuel && {
        name: "Carburante",
        type: "line",
        showSymbol: false,
        lineStyle: { width: 2, color: CHART_WARN },
        itemStyle: { color: CHART_WARN },
        data: points.map((p, i) => [distancesKm[i], p.fuelPct]),
      },
    ].filter(Boolean),
  };

  return (
    <div className={CARD}>
      <p className="mb-1 text-sm font-medium">Batteria e carburante</p>
      <ReactECharts option={option} style={{ height: HEIGHT }} notMerge />
    </div>
  );
}

export function SpeedChart({ points, distancesKm }: { points: GpxPoint[]; distancesKm: number[] }) {
  if (!points.some((p) => p.speedKmh != null)) return null;

  const option = {
    ...baseGridOptions,
    yAxis: { ...yAxisMuted, name: "km/h", min: 0 },
    series: [
      {
        name: "Velocità",
        type: "line",
        showSymbol: false,
        lineStyle: { width: 2, color: CHART_ACCENT },
        areaStyle: { color: CHART_ACCENT, opacity: 0.12 },
        itemStyle: { color: CHART_ACCENT },
        data: points.map((p, i) => [distancesKm[i], p.speedKmh]),
      },
    ],
  };

  return (
    <div className={CARD}>
      <p className="mb-1 text-sm font-medium">Velocità</p>
      <ReactECharts option={option} style={{ height: HEIGHT }} notMerge />
    </div>
  );
}

export function ElevationChart({ points, distancesKm }: { points: GpxPoint[]; distancesKm: number[] }) {
  if (!points.some((p) => p.ele != null)) return null;

  const option = {
    ...baseGridOptions,
    yAxis: { ...yAxisMuted, name: "m" },
    series: [
      {
        name: "Altitudine",
        type: "line",
        showSymbol: false,
        lineStyle: { width: 2, color: CHART_ACCENT_SOFT },
        areaStyle: { color: CHART_ACCENT_SOFT, opacity: 0.12 },
        itemStyle: { color: CHART_ACCENT_SOFT },
        data: points.map((p, i) => [distancesKm[i], p.ele]),
      },
    ],
  };

  return (
    <div className={CARD}>
      <p className="mb-1 text-sm font-medium">Profilo altimetrico</p>
      <ReactECharts option={option} style={{ height: HEIGHT }} notMerge />
    </div>
  );
}
