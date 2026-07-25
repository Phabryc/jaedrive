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

// Approximate palette (not yet cross-checked against the Android app's EnergyFlowUtil/
// colors.xml at time of writing) - adjust to match exactly once the Android sync client
// ships and the two can be compared side by side.
export const BUCKET_COLOR: Record<EnergyBucket, string> = {
  EV: "#00BFFF",
  SERIES: "#FB8C00",
  PARALLEL: "#C62828",
  CHR: "#2E7D32",
  IDLE: "#8A8F98",
};
