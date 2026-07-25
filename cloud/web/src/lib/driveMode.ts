// Stessi colori/etichette usati da MainActivity.driveModeColor()/driveModeLabel() in
// Android (ECO=verde trend_positive, NORMAL=accento, SPORT=rosso trend_negative) - chiave
// stringa perche' GpxPoint.driveMode (0/1/2) diventa null-safe solo dopo String(...).
export type DriveModeKey = "0" | "1" | "2";

export const DRIVE_MODE_COLOR: Record<DriveModeKey, string> = {
  "0": "#2E7D32",
  "1": "#00BFFF",
  "2": "#C62828",
};

export const DRIVE_MODE_LABEL: Record<DriveModeKey, string> = {
  "0": "ECO",
  "1": "NORMAL",
  "2": "SPORT",
};
