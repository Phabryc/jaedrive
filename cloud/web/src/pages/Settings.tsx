import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { useProfile } from "../lib/ProfileContext";
import { COUNTRIES } from "../lib/countries";

export default function Settings() {
  const { profile } = useProfile();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const countryName = COUNTRIES.find((c) => c.code === profile?.nationality)?.name ?? profile?.nationality;

  function reload() {
    api.vehicles().then(setVehicles);
  }
  useEffect(reload, []);

  async function saveNickname(id: string) {
    const nickname = editing[id]?.trim();
    if (!nickname) return;
    await api.renameVehicle(id, nickname);
    setEditing((e) => ({ ...e, [id]: "" }));
    reload();
  }

  async function deleteVehicle(id: string, nickname: string) {
    if (!confirm(`Eliminare "${nickname}" e tutti i suoi viaggi? L'operazione non può essere annullata.`)) return;
    await api.deleteVehicle(id);
    reload();
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold">Impostazioni</h1>

      <section className="mb-8 flex items-center gap-4 rounded-lg border border-surface-border bg-surface p-4">
        {profile?.photoUrl ? (
          <img src={profile.photoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-border text-sm font-medium text-onsurface-variant">
            {(profile?.firstName?.[0] ?? "") + (profile?.lastName?.[0] ?? "")}
          </div>
        )}
        <div>
          <p className="text-sm font-medium">
            {profile?.firstName} {profile?.lastName}
          </p>
          <p className="text-sm text-onsurface-variant">{profile?.email}</p>
          {countryName && <p className="text-xs text-onsurface-variant">{countryName}</p>}
        </div>
      </section>

      <section>
        <p className="mb-3 text-sm font-medium">Le mie auto</p>
        <div className="flex flex-col gap-3">
          {vehicles.map((v) => (
            <div key={v.id} className="rounded-lg border border-surface-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{v.nickname}</p>
                  <p className="font-mono text-xs text-onsurface-variant">{v.vin}</p>
                </div>
                <button
                  onClick={() => deleteVehicle(v.id, v.nickname)}
                  className="rounded-md border border-bad px-3 py-1 text-xs text-bad hover:bg-bad/10"
                >
                  Elimina auto
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  placeholder="Nuovo nome"
                  value={editing[v.id] ?? ""}
                  onChange={(e) => setEditing((s) => ({ ...s, [v.id]: e.target.value }))}
                  className="flex-1 rounded-md border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={() => saveNickname(v.id)}
                  className="rounded-md border border-surface-border px-3 py-1.5 text-sm hover:border-accent"
                >
                  Rinomina
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
