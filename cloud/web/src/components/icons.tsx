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

// Stessa pathData esatta di ic_nav_settings.xml (Android) - stesso ingranaggio della tab
// Impostazioni in app, tinta via currentColor (2026-08-02, header mobile di AppShell).
export function IconSettings({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className}>
      <path d="M19.14,12.94c0.04,-0.3 0.06,-0.61 0.06,-0.94c0,-0.32 -0.02,-0.64 -0.07,-0.94l2.03,-1.58c0.18,-0.14 0.23,-0.41 0.12,-0.61l-1.92,-3.32c-0.12,-0.22 -0.37,-0.29 -0.59,-0.22l-2.39,0.96c-0.5,-0.38 -1.03,-0.7 -1.62,-0.94L14.4,2.81c-0.04,-0.24 -0.24,-0.41 -0.48,-0.41h-3.84c-0.24,0 -0.43,0.17 -0.47,0.41L9.25,5.35C8.66,5.59 8.12,5.92 7.63,6.29L5.24,5.33c-0.22,-0.08 -0.47,0 -0.59,0.22L2.74,8.87c-0.12,0.21 -0.08,0.47 0.12,0.61l2.03,1.58C4.84,11.36 4.8,11.69 4.8,12s0.02,0.64 0.07,0.94l-2.03,1.58c-0.18,0.14 -0.23,0.41 -0.12,0.61l1.92,3.32c0.12,0.22 0.37,0.29 0.59,0.22l2.39,-0.96c0.5,0.38 1.03,0.7 1.62,0.94l0.36,2.54c0.05,0.24 0.24,0.41 0.48,0.41h3.84c0.24,0 0.44,-0.17 0.47,-0.41l0.36,-2.54c0.59,-0.24 1.13,-0.56 1.62,-0.94l2.39,0.96c0.22,0.08 0.47,0 0.59,-0.22l1.92,-3.32c0.12,-0.22 0.07,-0.47 -0.12,-0.61L19.14,12.94zM12,15.6c-1.98,0 -3.6,-1.62 -3.6,-3.6s1.62,-3.6 3.6,-3.6s3.6,1.62 3.6,3.6S13.98,15.6 12,15.6z" />
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

export function IconCopy({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconLogout({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function IconUser({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconAdmin({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
