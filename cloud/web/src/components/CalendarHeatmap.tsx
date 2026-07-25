import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import { api } from "../lib/api";
import { CHART_TEXT_MUTED, CHART_SURFACE, CHART_BORDER } from "../lib/chartTheme";

// Heatmap "giorni guidati" (cloud/DESIGN.md §12) - un anno alla volta. Scala sequenziale a
// una sola tinta (accento, chiaro->scuro all'aumentare dei km) come richiesto dalla dataviz
// skill per una misura di magnitudine, mai un arcobaleno multi-tinta.
export function CalendarHeatmap({ vehicleId }: { vehicleId: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<{ date: string; km: number; tripCount: number }[] | null>(null);

  useEffect(() => {
    setData(null);
    api.statsCalendar(vehicleId, year).then((r) => setData(r.days));
  }, [vehicleId, year]);

  if (data && data.length === 0) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Giorni guidati</p>
          <YearNav year={year} setYear={setYear} />
        </div>
        <p className="text-sm text-onsurface-variant">Nessun viaggio nel {year}.</p>
      </div>
    );
  }

  const maxKm = data ? Math.max(1, ...data.map((d) => d.km)) : 1;

  const option = {
    tooltip: {
      backgroundColor: CHART_SURFACE,
      borderColor: CHART_BORDER,
      textStyle: { color: "#E5E2E1" },
      formatter: (p: { data: [string, number] }) => {
        const day = data?.find((d) => d.date === p.data[0]);
        if (!day || day.km <= 0) return `${p.data[0]}: nessun viaggio`;
        return `${p.data[0]}: ${day.km.toFixed(1)} km · ${day.tripCount} viaggi`;
      },
    },
    visualMap: {
      show: false,
      min: 0,
      max: maxKm,
      inRange: { color: ["rgba(0,191,255,0.08)", "#00BFFF"] },
    },
    calendar: {
      range: String(year),
      cellSize: [14, 14],
      splitLine: { lineStyle: { color: CHART_BORDER } },
      itemStyle: { borderColor: "#0A0A0A", borderWidth: 2, color: "rgba(255,255,255,0.03)" },
      yearLabel: { show: false },
      monthLabel: { color: CHART_TEXT_MUTED, fontSize: 11 },
      // "it" non e' un locale built-in riconosciuto da ECharts (solo "en"/"cn") - passiamo
      // l'array esplicito invece di affidarci a una stringa magica non verificata.
      dayLabel: { color: CHART_TEXT_MUTED, fontSize: 10, nameMap: ["dom", "lun", "mar", "mer", "gio", "ven", "sab"] },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: (data ?? []).filter((d) => d.km > 0).map((d) => [d.date, d.km]),
      },
    ],
  };

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Giorni guidati</p>
        <YearNav year={year} setYear={setYear} />
      </div>
      <div className="overflow-x-auto">
        <ReactECharts option={option} style={{ height: 200, minWidth: 700 }} notMerge />
      </div>
    </div>
  );
}

function YearNav({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-onsurface-variant">
      <button onClick={() => setYear(year - 1)} className="rounded border border-surface-border px-2 py-0.5 hover:text-onsurface">
        ←
      </button>
      <span className="tabular-nums">{year}</span>
      <button onClick={() => setYear(year + 1)} className="rounded border border-surface-border px-2 py-0.5 hover:text-onsurface">
        →
      </button>
    </div>
  );
}
