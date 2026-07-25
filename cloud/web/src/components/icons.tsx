// Piccola libreria di icone a tratto, in linea con lo stile "Aetheris Automotive" (semplici,
// monocolore via currentColor, nessuna dipendenza esterna) - non e' un porting diretto delle
// vector drawable Android (formati incompatibili), ma stesso linguaggio visivo minimale.
const BASE = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconRoute({ size = 16 }: { size?: number }) {
  return (
    <svg {...BASE} width={size} height={size}>
      <path d="M7 3 4 21M17 3l3 18" />
      <path d="M11 3v3M11 10v3M11 17v3" />
    </svg>
  );
}

export function IconGauge({ size = 16 }: { size?: number }) {
  return (
    <svg {...BASE} width={size} height={size}>
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15l4-5" />
      <path d="M12 15v0" />
    </svg>
  );
}

export function IconFuel({ size = 16 }: { size?: number }) {
  return (
    <svg {...BASE} width={size} height={size}>
      <path d="M5 20V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15" />
      <path d="M4 20h10" />
      <path d="M13 9h1.5l2.5 2.5V16a1.3 1.3 0 0 0 2.6 0v-3.2L17 10" />
    </svg>
  );
}

export function IconClock({ size = 16 }: { size?: number }) {
  return (
    <svg {...BASE} width={size} height={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
