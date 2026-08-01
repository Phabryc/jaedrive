import { createContext, useContext, useState, type ReactNode } from "react";
import type { ConsumptionFormat, DistanceUnit } from "./units";

// Stesso pattern di LanguageContext.tsx: preferenza SOLO locale a questo browser
// (localStorage), non sincronizzata col backend ne' con l'app Android - coerente con come
// la lingua e' gia' gestita oggi (nessuna preferenza utente e' oggi sincronizzata sul
// server, vedi Prisma User). I default (km, formato "ratio" = km/l) coincidono con quelli
// gia' in uso prima di questa feature (richiesta esplicita 2026-08-02: "i default rimangono
// gli attuali").
const STORAGE_KEY_DISTANCE = "jaedrive_unit_distance";
const STORAGE_KEY_CONSUMPTION = "jaedrive_unit_consumption";

interface UnitsState {
  distanceUnit: DistanceUnit;
  setDistanceUnit: (u: DistanceUnit) => void;
  consumptionFormat: ConsumptionFormat;
  setConsumptionFormat: (f: ConsumptionFormat) => void;
}

const UnitsContext = createContext<UnitsState | null>(null);

function readStored<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  return (valid as readonly string[]).includes(stored ?? "") ? (stored as T) : fallback;
}

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>(() =>
    readStored(STORAGE_KEY_DISTANCE, ["km", "mi"], "km"),
  );
  const [consumptionFormat, setConsumptionFormatState] = useState<ConsumptionFormat>(() =>
    readStored(STORAGE_KEY_CONSUMPTION, ["ratio", "l100"], "ratio"),
  );

  function setDistanceUnit(u: DistanceUnit) {
    setDistanceUnitState(u);
    try {
      localStorage.setItem(STORAGE_KEY_DISTANCE, u);
    } catch {
      // Storage non disponibile - la scelta resta valida solo per questa sessione.
    }
  }

  function setConsumptionFormat(f: ConsumptionFormat) {
    setConsumptionFormatState(f);
    try {
      localStorage.setItem(STORAGE_KEY_CONSUMPTION, f);
    } catch {
      // Vedi sopra.
    }
  }

  return (
    <UnitsContext.Provider value={{ distanceUnit, setDistanceUnit, consumptionFormat, setConsumptionFormat }}>
      {children}
    </UnitsContext.Provider>
  );
}

export function useUnits() {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error("useUnits must be used within a UnitsProvider");
  return ctx;
}
