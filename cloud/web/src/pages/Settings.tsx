import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { api, ApiError } from "../lib/api";
import type { Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { hasElectricData } from "../lib/vehicleCatalog";
import { useProfile } from "../lib/ProfileContext";
import { useLanguage } from "../lib/i18n/LanguageContext";

export default function Settings() {
  const { profile } = useProfile();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  // Manutenzione per veicolo (spostata qui da Trips.tsx su richiesta 2026-08-01: sono
  // operazioni di ricalcolo/riparazione dati, non filtri della vista viaggi) - stato tenuto
  // per id veicolo come "editing" qui sopra, cosi' piu' auto non si pestano i piedi a
  // vicenda se l'utente ne ha piu' di una.
  const [backfillBusy, setBackfillBusy] = useState<Record<string, boolean>>({});
  const [backfillStatus, setBackfillStatus] = useState<Record<string, string | null>>({});
  const [energyBackfillBusy, setEnergyBackfillBusy] = useState<Record<string, boolean>>({});
  const [energyBackfillStatus, setEnergyBackfillStatus] = useState<Record<string, string | null>>({});

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

  // Recupero indirizzi mancanti (vedi routes/user.ts) - i trip caricati prima del fallback
  // di geocoding lato server restano "Percorso GPS" per sempre senza questo, anche se la
  // traccia GPX ce l'hanno gia'. Un batch alla volta: se ne restano, l'utente puo' ricliccare.
  async function handleBackfillAddresses(vehicleId: string) {
    setBackfillBusy((s) => ({ ...s, [vehicleId]: true }));
    setBackfillStatus((s) => ({ ...s, [vehicleId]: null }));
    try {
      const res = await api.backfillAddresses(vehicleId);
      const status = res.scanned === 0
        ? t("settings.backfillAllPresent")
        : t("settings.backfillResult", { updated: res.updated, scanned: res.scanned }) +
          (res.remaining > 0 ? t("settings.backfillContinue") : "");
      setBackfillStatus((s) => ({ ...s, [vehicleId]: status }));
    } catch {
      setBackfillStatus((s) => ({ ...s, [vehicleId]: t("settings.backfillError") }));
    } finally {
      setBackfillBusy((s) => ({ ...s, [vehicleId]: false }));
    }
  }

  // Ricalcola km EV/HEV per i trip AUTO gia' caricati (vedi routes/user.ts) - serve solo una
  // volta per lo storico esistente da prima del fix (2026-08-01, i segnali VDB precedenti
  // sono confermati inaffidabili), i nuovi upload sono gia' corretti senza bisogno di questo.
  // Un solo giro basta (nessun servizio esterno rate-limitato di mezzo), niente "remaining".
  async function handleBackfillEnergyKm(vehicleId: string) {
    setEnergyBackfillBusy((s) => ({ ...s, [vehicleId]: true }));
    setEnergyBackfillStatus((s) => ({ ...s, [vehicleId]: null }));
    try {
      const res = await api.backfillEnergyKm(vehicleId);
      setEnergyBackfillStatus((s) => ({
        ...s,
        [vehicleId]: t("settings.energyBackfillResult", { updated: res.updated, scanned: res.scanned }),
      }));
    } catch {
      setEnergyBackfillStatus((s) => ({ ...s, [vehicleId]: t("settings.backfillError") }));
    } finally {
      setEnergyBackfillBusy((s) => ({ ...s, [vehicleId]: false }));
    }
  }

  async function deleteVehicle(id: string, nickname: string) {
    if (!confirm(t("settings.deleteVehicleConfirm", { name: nickname }))) return;
    await api.deleteVehicle(id);
    reload();
  }

  // Cancellazione account completa (jaedrive_todo #1) - a differenza di deleteVehicle()
  // sopra, dopo la chiamata al server l'utente non ha piu' un'identita' valida: bisogna
  // anche fare signOut() locale (il token gia' emesso da Firebase resterebbe altrimenti in
  // memoria/localStorage finche' non scade da solo) e portarlo fuori dall'app autenticata.
  async function deleteAccount() {
    if (!confirm(t("settings.deleteAccountConfirm"))) return;
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      await api.deleteAccount();
      await signOut(auth);
      navigate("/", { replace: true });
    } catch (err) {
      setDeleteAccountError(err instanceof ApiError ? err.message : t("settings.deleteAccountError"));
      setDeletingAccount(false);
    }
  }

  return (
    <AppShell>
      {/* Pagina di impostazioni: form/liste corte, non una dashboard - restano leggibili
          con una larghezza contenuta anche ora che AppShell si e' allargata per le pagine
          che invece SONO dashboard (Trips.tsx). */}
      <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t("settings.title")}</h1>

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
        </div>
      </section>

      <section className="mb-8 flex items-center justify-between rounded-lg border border-surface-border bg-surface p-4">
        <p className="text-sm font-medium">{t("settings.language")}</p>
        <LanguageSwitcher />
      </section>

      <section className="mb-8">
        <p className="mb-3 text-sm font-medium">{t("appShell.myVehicles")}</p>
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
                  {t("settings.deleteVehicle")}
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  placeholder={t("settings.newNamePlaceholder")}
                  value={editing[v.id] ?? ""}
                  onChange={(e) => setEditing((s) => ({ ...s, [v.id]: e.target.value }))}
                  className="flex-1 rounded-md border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={() => saveNickname(v.id)}
                  className="rounded-md border border-surface-border px-3 py-1.5 text-sm hover:border-accent"
                >
                  {t("settings.rename")}
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-2 border-t border-surface-border pt-3">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <button
                    onClick={() => handleBackfillAddresses(v.id)}
                    disabled={backfillBusy[v.id]}
                    className="rounded-md border border-surface-border px-3 py-1 text-onsurface-variant hover:border-accent hover:text-onsurface disabled:opacity-50"
                  >
                    {backfillBusy[v.id] ? t("settings.backfillBusy") : t("settings.backfillButton")}
                  </button>
                  {backfillStatus[v.id] && <span className="text-onsurface-variant">{backfillStatus[v.id]}</span>}
                </div>
                {hasElectricData(v.powertrain) && (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <button
                      onClick={() => handleBackfillEnergyKm(v.id)}
                      disabled={energyBackfillBusy[v.id]}
                      className="rounded-md border border-surface-border px-3 py-1 text-onsurface-variant hover:border-accent hover:text-onsurface disabled:opacity-50"
                    >
                      {energyBackfillBusy[v.id] ? t("settings.energyBackfillBusy") : t("settings.energyBackfillButton")}
                    </button>
                    {energyBackfillStatus[v.id] && <span className="text-onsurface-variant">{energyBackfillStatus[v.id]}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-bad/40 bg-bad/5 p-4">
        <p className="mb-1 text-sm font-medium text-bad">{t("settings.dangerZoneTitle")}</p>
        <p className="mb-3 text-sm text-onsurface-variant">{t("settings.deleteAccountDescription")}</p>
        {deleteAccountError && <p className="mb-3 text-sm text-bad">{deleteAccountError}</p>}
        <button
          onClick={deleteAccount}
          disabled={deletingAccount}
          className="rounded-md border border-bad px-3 py-1.5 text-sm text-bad hover:bg-bad/10 disabled:opacity-50"
        >
          {t("settings.deleteAccount")}
        </button>
      </section>
      </div>
    </AppShell>
  );
}
