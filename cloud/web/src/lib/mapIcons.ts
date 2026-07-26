import L from "leaflet";

// Estratte da TripMap.tsx (2026-07-26) per essere riusate anche da RouteMapEditor.tsx -
// stesso significato/pathData delle icone di partenza/arrivo usate ovunque nell'app (pin di
// partenza tinto accento, bandiera a scacchi di arrivo). className:"" evita il box bianco
// di default di Leaflet per i divIcon.
export const START_ICON = L.divIcon({
  className: "",
  html: '<svg viewBox="0 0 24 24" width="28" height="28" fill="#00BFFF"><path fill-rule="evenodd" clip-rule="evenodd" d="M12,2C8.13,2 5,5.13 5,9c0,5.25 7,13 7,13s7,-7.75 7,-13C19,5.13 15.87,2 12,2zM12,11.5c-1.38,0 -2.5,-1.12 -2.5,-2.5s1.12,-2.5 2.5,-2.5s2.5,1.12 2.5,2.5S13.38,11.5 12,11.5z"/></svg>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

export const END_ICON = L.divIcon({
  className: "",
  html: `<svg viewBox="0 0 24 24" width="28" height="28">
    <path fill="#9E9E9E" d="M4,3h1v18h-1z"/>
    <path fill="#212121" d="M5,3h3v4h-3zM11,3h3v4h-3zM8,7h3v4h-3zM14,7h3v4h-3z"/>
    <path fill="#EEEEEE" d="M8,3h3v4h-3zM14,3h3v4h-3zM5,7h3v4h-3zM11,7h3v4h-3z"/>
  </svg>`,
  iconSize: [28, 28],
  iconAnchor: [5, 28],
});
