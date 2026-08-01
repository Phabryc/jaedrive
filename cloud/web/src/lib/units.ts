// Conversioni di SOLA visualizzazione (i dati restano sempre salvati/caricati in km e
// km/litro, vedi cloud/DESIGN.md e SyncWorker.java lato Android) - controparte web dello
// stesso schema di UnitFormatter.java. Due assi indipendenti:
// - distanza: km oppure mi
// - consumo: "ratio" (percorrenza per unita' di carburante) oppure "l100" (carburante per
//   100 unita' di distanza)
// L'unita' di CARBURANTE segue la distanza in entrambi i formati (mercato UK, richiesta
// esplicita 2026-08-02): litri se km (km/l, L/100km), GALLONE IMPERIALE (non USA) se mi
// (mpg, gal/100mi) - mai litri quando la distanza e' in miglia. "(UK)" nell'etichetta per
// non lasciare ambiguita' su quale gallone (l'imperiale, 4.546 L, e' diverso da quello USA,
// 3.785 L, con cui "mpg"/"gal" da soli si confondono facilmente).
export type DistanceUnit = "km" | "mi";
export type ConsumptionFormat = "ratio" | "l100";

const KM_TO_MI = 0.621371;
const L_PER_IMPERIAL_GALLON = 4.54609;

export function toDisplayDistance(km: number, unit: DistanceUnit): number {
  return unit === "mi" ? km * KM_TO_MI : km;
}

export function formatDistance(km: number, unit: DistanceUnit, decimals = 1): string {
  return `${toDisplayDistance(km, unit).toFixed(decimals)} ${unit}`;
}

// Velocita' - stessa conversione di UnitFormatter.toDisplaySpeedKmh() lato Android, non
// dipende dal formato ratio/l100 (non ha senso una "velocita' per 100").
export function toDisplaySpeedKmh(speedKmh: number, unit: DistanceUnit): number {
  return unit === "mi" ? speedKmh * KM_TO_MI : speedKmh;
}

export function speedUnitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "mph" : "km/h";
}

// kmPerLiter deve sempre essere > 0 (avgConsumption non-null implica litri>0 - vedi il caso
// "0 litri, km reali" gestito a parte da formatConsumptionOrElectric).
export function toDisplayConsumption(kmPerLiter: number, unit: DistanceUnit, format: ConsumptionFormat): number {
  if (format === "l100") {
    const perHundredKm = 100 / kmPerLiter;
    if (unit === "mi") return perHundredKm / (KM_TO_MI * L_PER_IMPERIAL_GALLON); // gal/100mi imperiale
    return perHundredKm; // L/100km
  }
  if (unit === "mi") return kmPerLiter * KM_TO_MI * L_PER_IMPERIAL_GALLON; // mpg imperiale
  return kmPerLiter; // km/l
}

export function consumptionUnitLabel(unit: DistanceUnit, format: ConsumptionFormat): string {
  if (format === "l100") return unit === "mi" ? "gal/100mi (UK)" : "L/100km";
  return unit === "mi" ? "mpg (UK)" : "km/l";
}

export function formatConsumption(kmPerLiter: number, unit: DistanceUnit, format: ConsumptionFormat): string {
  return `${toDisplayConsumption(kmPerLiter, unit, format).toFixed(1)} ${consumptionUnitLabel(unit, format)}`;
}

// Variante per i punti dove avgConsumption puo' essere null con litri===0 (tratto
// elettrico su un ibrido): con formato "l100" il valore E' rappresentabile (0.0, finito),
// con formato "ratio" (km/l o mpg) resta infinito/non rappresentabile - da qui l'etichetta
// dedicata "100% elettrico" solo in quel caso (comportamento gia' esistente, vedi
// VehicleStatsPanel.tsx TripRefCard).
export function formatConsumptionOrElectric(
  avgConsumption: number | null,
  liters: number | null,
  unit: DistanceUnit,
  format: ConsumptionFormat,
  allElectricLabel: string,
): string {
  if (avgConsumption != null) return formatConsumption(avgConsumption, unit, format);
  if (liters === 0) {
    if (format === "l100") return `0.0 ${consumptionUnitLabel(unit, format)}`;
    return allElectricLabel;
  }
  return "—";
}
