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

// Immagine stilizzata per modello - in attesa dei riferimenti reali (vedi
// jaedrive_project memory), nessuna immagine e' ancora disponibile: vehicleImageFor()
// ritorna sempre null e il componente che la usa mostra un badge testuale al suo posto,
// mai un placeholder generico spacciato per "il modello vero".
const MODEL_IMAGES: Record<string, string> = {};

export function vehicleImageFor(brand: string | null, model: string | null): string | null {
  if (!brand || !model) return null;
  return MODEL_IMAGES[`${brand}_${model}`] ?? null;
}
