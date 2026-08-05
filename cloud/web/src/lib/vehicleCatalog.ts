// Specchio (solo per la visualizzazione) di VehicleCatalog.java lato Android - le stesse
// chiavi stabili, qui solo per tradurle in etichette leggibili. La marca/modello/motorizzazione
// reali sono impostati dall'onboarding Android, non modificabili da qui.
const POWERTRAIN_LABEL: Record<string, string> = {
  ICE_2WD: "ICE 2WD",
  ICE_4WD: "ICE 4WD",
  SHS_H: "SHS-H",
  SHS_P: "SHS-P",
  SHS_P_4WD: "SHS-P 4WD",
  BEV: "BEV",
};

export function powertrainLabel(key: string | null): string {
  if (!key) return "";
  return POWERTRAIN_LABEL[key] ?? key;
}

export function vehicleTitle(brand: string | null, model: string | null, powertrain: string | null): string {
  return [brand, model, powertrainLabel(powertrain)].filter(Boolean).join(" ");
}

// Sketch line-art in bianco e nero con sfondo trasparente derivati e riconosciuti dai modelli ufficiali:
// vista 3/4 anteriore orientata a sinistra per Jaecoo (5, 7, 8) e Omoda (5, 7, 9).
// File in /public/vehicles/, serviti da Vite.
const MODEL_IMAGES: Record<string, string> = {
  JAECOO_5: "/vehicles/jaecoo_5.png?v=all_transparent",
  JAECOO_7: "/vehicles/jaecoo_7.png?v=all_transparent",
  JAECOO_8: "/vehicles/jaecoo_8.png?v=all_transparent",
  OMODA_5: "/vehicles/omoda_5.png?v=all_transparent",
  OMODA_7: "/vehicles/omoda_7.png?v=all_transparent",
  OMODA_9: "/vehicles/omoda_9.png?v=all_transparent",
};

export function vehicleImageFor(brand: string | null, model: string | null): string | null {
  if (!brand || !model) return null;
  return MODEL_IMAGES[`${brand}_${model}`] ?? null;
}

// Specchio di VehicleCatalog.EnergyCapability (Android) - decide quali sezioni mostrare per
// una data motorizzazione. ICE_2WD/ICE_4WD non hanno trazione elettrica: niente donut
// energia, split km EV/ibrido, grafico batteria - quei trip non hanno mai questi campi
// popolati (vedi SyncWorker), ma la UI li nasconde esplicitamente invece di mostrare
// sezioni vuote/a zero.
export type EnergyCapability = "ICE" | "HYBRID" | "BEV";

export function capabilityFor(powertrain: string | null): EnergyCapability | null {
  if (!powertrain) return null;
  if (powertrain === "ICE_2WD" || powertrain === "ICE_4WD") return "ICE";
  if (powertrain === "BEV") return "BEV";
  return "HYBRID"; // SHS_H, SHS_P, SHS_P_4WD
}

// null (motorizzazione non ancora sincronizzata) -> true, per non nascondere dati
// potenzialmente validi prima di sapere che l'auto e' solo ICE.
export function hasElectricData(powertrain: string | null): boolean {
  return capabilityFor(powertrain) !== "ICE";
}
