import { Link } from "react-router-dom";
import type { Vehicle } from "../lib/types";
import { vehicleTitle, vehicleImageFor } from "../lib/vehicleCatalog";

// Marca/modello/motorizzazione arrivano dall'onboarding obbligatorio Android (non
// modificabili da qui) - il nickname invece si modifica in Impostazioni (gia' esistente),
// linkato da qui invece di duplicare quella UI.
export function VehicleInfoCard({ vehicle }: { vehicle: Vehicle }) {
  const title = vehicleTitle(vehicle.brand, vehicle.model, vehicle.powertrain);
  const image = vehicleImageFor(vehicle.brand, vehicle.model);

  return (
    <div className="mb-6 flex items-center gap-4 rounded-xl border border-surface-border bg-surface p-5">
      <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-border bg-bg/40">
        {image ? (
          <img src={image} alt={title} className="h-full w-full object-contain" />
        ) : (
          <span className="px-2 text-center text-[11px] leading-tight text-onsurface-variant">
            {vehicle.brand ? `${vehicle.brand}${vehicle.model ? " " + vehicle.model : ""}` : "Auto non configurata"}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold">{vehicle.nickname}</p>
        {title ? (
          <p className="text-sm text-onsurface-variant">{title}</p>
        ) : (
          <p className="text-sm text-onsurface-variant">Marca/modello non ancora sincronizzati dall'app</p>
        )}
        <Link to="/settings" className="mt-1 inline-block text-xs text-accent hover:underline">
          Modifica nome →
        </Link>
      </div>
    </div>
  );
}
