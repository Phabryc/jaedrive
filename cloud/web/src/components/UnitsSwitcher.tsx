import { useUnits } from "../lib/UnitsContext";
import { consumptionUnitLabel, type ConsumptionFormat, type DistanceUnit } from "../lib/units";

// Stesso pattern a pillola di LanguageSwitcher.tsx, ma per le due unita' di visualizzazione
// (richiesta 2026-08-02) - vedi UnitsContext/lib/units.ts. Due switcher separati invece di
// uno solo perche' sono due assi indipendenti (vedi Settings.tsx, una riga ciascuno).
const DISTANCE_UNITS: DistanceUnit[] = ["km", "mi"];
const CONSUMPTION_FORMATS: ConsumptionFormat[] = ["ratio", "l100"];

export function DistanceUnitSwitcher({ className = "" }: { className?: string }) {
  const { distanceUnit, setDistanceUnit } = useUnits();
  return (
    <div className={`flex gap-1 text-xs ${className}`}>
      {DISTANCE_UNITS.map((u) => (
        <button
          key={u}
          onClick={() => setDistanceUnit(u)}
          className={`rounded px-2.5 py-1 ${
            distanceUnit === u ? "bg-accent text-bg" : "text-onsurface-variant hover:text-onsurface"
          }`}
        >
          {u}
        </button>
      ))}
    </div>
  );
}

// Le due etichette dipendono dall'unita' di distanza gia' scelta (mpg/gal-100mi "(UK)" solo
// con le miglia, vedi lib/units.ts consumptionUnitLabel) - non sono testo fisso.
export function ConsumptionFormatSwitcher({ className = "" }: { className?: string }) {
  const { distanceUnit, consumptionFormat, setConsumptionFormat } = useUnits();
  return (
    <div className={`flex gap-1 text-xs ${className}`}>
      {CONSUMPTION_FORMATS.map((f) => (
        <button
          key={f}
          onClick={() => setConsumptionFormat(f)}
          className={`rounded px-2.5 py-1 ${
            consumptionFormat === f ? "bg-accent text-bg" : "text-onsurface-variant hover:text-onsurface"
          }`}
        >
          {consumptionUnitLabel(distanceUnit, f)}
        </button>
      ))}
    </div>
  );
}
