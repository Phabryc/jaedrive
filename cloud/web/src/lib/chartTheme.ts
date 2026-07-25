// Tema ECharts condiviso per tutti i grafici dell'app - stessi token "Aetheris Automotive"
// di tailwind.config.js (Tailwind non e' leggibile da una libreria JS, quindi qui sono
// ripetuti come stringhe esadecimali letterali, tenerli allineati se i token cambiano).
export const CHART_BG = "#0A0A0A";
export const CHART_SURFACE = "#191919";
export const CHART_BORDER = "rgba(255,255,255,0.1)";
export const CHART_TEXT = "#E5E2E1";
export const CHART_TEXT_MUTED = "#BCC8D1";
export const CHART_ACCENT = "#00BFFF";
export const CHART_ACCENT_SOFT = "#8FD6FF";
export const CHART_WARN = "#FB8C00";

// Griglia/assi recessivi (poco contrasto, non devono competere con i dati), tooltip con
// crosshair sull'asse - vedi dataviz skill references/interaction.md.
export const baseGridOptions = {
  backgroundColor: "transparent",
  textStyle: { color: CHART_TEXT, fontFamily: "Inter, system-ui, sans-serif" },
  grid: { left: 40, right: 16, top: 16, bottom: 28, containLabel: true },
  tooltip: {
    trigger: "axis" as const,
    backgroundColor: CHART_SURFACE,
    borderColor: CHART_BORDER,
    textStyle: { color: CHART_TEXT },
    axisPointer: { type: "cross" as const, label: { backgroundColor: "#333" } },
  },
  xAxis: {
    type: "value" as const,
    name: "km",
    nameLocation: "end" as const,
    nameTextStyle: { color: CHART_TEXT_MUTED, fontSize: 11 },
    axisLine: { lineStyle: { color: CHART_BORDER } },
    axisLabel: { color: CHART_TEXT_MUTED, fontSize: 11 },
    splitLine: { show: false },
  },
};

export const yAxisMuted = {
  type: "value" as const,
  axisLine: { show: false },
  axisLabel: { color: CHART_TEXT_MUTED, fontSize: 11 },
  splitLine: { lineStyle: { color: CHART_BORDER } },
};
