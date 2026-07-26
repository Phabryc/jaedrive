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

export function IconCloud({ size = 16 }: { size?: number }) {
  return (
    <svg {...BASE} width={size} height={size}>
      <path d="M7 18a4.5 4.5 0 0 1-.5-8.98A5.5 5.5 0 0 1 17.2 8.06 4 4 0 0 1 17 16H7z" />
    </svg>
  );
}

export function IconBattery({ size = 16 }: { size?: number }) {
  return (
    <svg {...BASE} width={size} height={size}>
      <rect x="3" y="7" width="15" height="10" rx="2" />
      <path d="M20 10v4" />
      <path d="M8 9.5 6 12.5h3l-2 3" strokeLinejoin="round" />
    </svg>
  );
}

// Stessa pathData esatta di app/src/main/res/drawable/ic_location.xml (Android) - pin di
// partenza, tinta via currentColor (li' e' tinta in codice allo stesso modo).
export function IconLocationPin({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12,2C8.13,2 5,5.13 5,9c0,5.25 7,13 7,13s7,-7.75 7,-13C19,5.13 15.87,2 12,2zM12,11.5c-1.38,0 -2.5,-1.12 -2.5,-2.5s1.12,-2.5 2.5,-2.5s2.5,1.12 2.5,2.5S13.38,11.5 12,11.5z"
      />
    </svg>
  );
}

// Stessa pathData esatta di ic_flag_checkered.xml (Android) - bandiera di arrivo, colori
// fissi (non tinta): lo scopo e' proprio il pattern bianco/nero, un tint uniforme
// l'appiattirebbe, stessa scelta gia' fatta lato app.
export function IconFlagCheckered({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path fill="#9E9E9E" d="M4,3h1v18h-1z" />
      <path fill="#212121" d="M5,3h3v4h-3zM11,3h3v4h-3zM8,7h3v4h-3zM14,7h3v4h-3z" />
      <path fill="#EEEEEE" d="M8,3h3v4h-3zM14,3h3v4h-3zM5,7h3v4h-3zM11,7h3v4h-3z" />
    </svg>
  );
}
