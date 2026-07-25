// Mirrors EnergyFlowUtil.bucketFor() in the Android app (com.phabryc.jaedrive) so the
// web map colors trip segments identically - see cloud/DESIGN.md §11 (TripMap). Keep this
// in sync if the Android bucket mapping ever changes.
export type EnergyBucket = "EV" | "SERIES" | "PARALLEL" | "CHR" | "IDLE";

export function bucketFor(value: number): EnergyBucket {
  switch (value) {
    case 2:
      return "EV";
    case 4:
    case 5:
    case 11:
      return "SERIES";
    case 8:
    case 10:
      return "PARALLEL";
    case 12:
    case 13:
    case 15:
    case 16:
      return "CHR";
    default:
      return "IDLE";
  }
}

// Exact values from EnergyFlowUtil.colorForBucket() in the Android app (0xFF00BFFF etc.).
export const BUCKET_COLOR: Record<EnergyBucket, string> = {
  EV: "#00BFFF",
  SERIES: "#FFC107",
  PARALLEL: "#F57C00",
  CHR: "#2E7D32",
  IDLE: "#4A4A4A",
};

// Stesse etichette mostrate in app (values/values-it strings.xml: label_flow_ev/series/
// parallel/regen/unknown) - "SERIES"/"PARALLEL"/"CHR" sono solo i nomi interni dell'enum,
// mai mostrati direttamente all'utente.
export const BUCKET_LABEL: Record<EnergyBucket, string> = {
  EV: "EV",
  SERIES: "HEV-S",
  PARALLEL: "HEV-P",
  CHR: "CHARGE",
  IDLE: "IDLE",
};
