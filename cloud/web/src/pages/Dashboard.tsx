import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { buttonVariants } from "../components/Button";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { vehicleTitle, vehicleImageFor } from "../lib/vehicleCatalog";

export default function Dashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);

  useEffect(() => {
    api.vehicles().then((v) => {
      setVehicles(v);
      if (v.length === 0) {
        navigate("/pair", { replace: true });
      } else if (v.length === 1) {
        // Se c'e' una sola auto nel garage, la seleziona automaticamente
        navigate(`/vehicles/${v[0].id}/trips`, { replace: true });
      }
    });
  }, [navigate]);

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("appShell.myVehicles")}</h1>
        <Link to="/pair" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {t("dashboard.addVehicle")}
        </Link>
      </div>

      {vehicles === null && <p className="text-onsurface-variant">{t("common.loading")}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {vehicles?.map((v) => {
          const image = vehicleImageFor(v.brand, v.model);
          return (
            <Link
              key={v.id}
              to={`/vehicles/${v.id}/trips`}
              className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface p-5 transition hover:border-accent"
            >
              {image && (
                <img src={image} alt="" className="h-16 w-24 shrink-0 object-contain" />
              )}
              <div className="min-w-0">
                <p className="text-lg font-medium">{v.nickname}</p>
                <p className="mt-1 text-sm text-onsurface-variant">
                  {vehicleTitle(v.brand, v.model, v.powertrain) || t("dashboard.notSynced")}
                </p>
                <p className="mt-3 font-mono text-xs text-onsurface-variant">{v.vin}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
