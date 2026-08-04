import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { api, ApiError } from "../lib/api";
import type { Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/Button";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { DistanceUnitSwitcher, ConsumptionFormatSwitcher } from "../components/UnitsSwitcher";
import { hasElectricData } from "../lib/vehicleCatalog";
import { useProfile } from "../lib/ProfileContext";
import { useLanguage } from "../lib/i18n/LanguageContext";

export default function Settings() {
  const { profile, refresh: refreshProfile } = useProfile();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const [promoCode, setPromoCode] = useState("");
  const [redeemingPromo, setRedeemingPromo] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [backfillBusy, setBackfillBusy] = useState<Record<string, boolean>>({});
  const [backfillStatus, setBackfillStatus] = useState<Record<string, string | null>>({});
  const [energyBackfillBusy, setEnergyBackfillBusy] = useState<Record<string, boolean>>({});
  const [energyBackfillStatus, setEnergyBackfillStatus] = useState<Record<string, string | null>>({});

  async function handleRedeemPromo(e: React.FormEvent) {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setRedeemingPromo(true);
    setPromoMessage(null);
    setPromoError(null);
    try {
      const res = await api.redeemDiscountCode(promoCode.trim());
      setPromoMessage(res.message);
      setPromoCode("");
      await refreshProfile();
    } catch (err: any) {
      setPromoError(err.message || "Errore nel riscatto del codice promo");
    } finally {
      setRedeemingPromo(false);
    }
  }

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

  const sub = profile?.subscription;
  const badgeLabel = sub?.status === "PREMIUM" ? `PREMIUM ${sub.tier}` : "FREE";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold">{t("settings.titleUnified")}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* COLUMN 1: PROFILO, ABBONAMENTO, PREFERENZE */}
          <div className="space-y-6">
            {/* PROFILO UTENTE */}
            <section className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface p-5">
              {profile?.photoUrl ? (
                <img src={profile.photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-border text-base font-semibold text-onsurface-variant">
                  {(profile?.firstName?.[0] ?? "") + (profile?.lastName?.[0] ?? "")}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold">
                    {profile?.firstName} {profile?.lastName}
                  </p>
                  {profile?.role === "ADMIN" && (
                    <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                      ADMIN
                    </span>
                  )}
                </div>
                <p className="text-sm text-onsurface-variant">{profile?.email}</p>
              </div>
            </section>

            {/* ABBONAMENTO E GARAGE */}
            <section className="rounded-xl border border-surface-border bg-surface p-5">
              <h2 className="mb-4 text-base font-semibold">{t("settings.subAndGarage")}</h2>

              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    sub?.status === "PREMIUM"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-surface-border text-onsurface-variant"
                  }`}
                >
                  {badgeLabel}
                </span>
                {sub?.status === "PREMIUM" ? (
                  sub?.expiresAt ? (
                    <span className="text-xs text-onsurface-variant">
                      {t("settings.expiresOn")} <strong>{new Date(sub.expiresAt).toLocaleDateString()}</strong>
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-400">{t("settings.lifetime")}</span>
                  )
                ) : (
                  <span className="text-xs text-onsurface-variant">{t("settings.noExpirationFree")}</span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="rounded-lg border border-surface-border bg-bg/50 p-3">
                  <p className="text-xs text-onsurface-variant">{t("settings.garageSeatsOccupied")}</p>
                  <p className="mt-1 font-bold">
                    {t("settings.vehiclesCount", { active: sub?.activeVehicles ?? 0, max: sub?.maxVehicles ?? 1 })}
                  </p>
                </div>
                <div className="rounded-lg border border-surface-border bg-bg/50 p-3">
                  <p className="text-xs text-onsurface-variant">{t("settings.headunitSwapsLabel")}</p>
                  <p className="mt-1 font-bold">
                    {t("settings.swapsCount", { used: sub?.headunitSwaps ?? 0, max: sub?.maxHeadunitSwaps ?? 2 })}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs text-onsurface-variant">
                {t("settings.repairNotice")}
              </p>

              {/* RISCATTO CODICE PROMO */}
              <form onSubmit={handleRedeemPromo} className="mt-4 border-t border-surface-border pt-4">
                <p className="text-xs font-semibold text-onsurface-variant mb-2">{t("settings.redeemTitle")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder={t("settings.redeemPlaceholder")}
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    className="min-w-0 flex-1 rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm uppercase outline-none focus:border-accent"
                  />
                  <Button type="submit" variant="secondary" size="sm" disabled={redeemingPromo || !promoCode.trim()}>
                    {redeemingPromo ? t("settings.redeeming") : t("settings.redeemButton")}
                  </Button>
                </div>
                {promoMessage && <p className="mt-2 text-xs font-semibold text-emerald-400">{promoMessage}</p>}
                {promoError && <p className="mt-2 text-xs font-semibold text-bad">{promoError}</p>}
              </form>
            </section>

            {/* LINGUA E UNITÀ */}
            <section className="space-y-3 rounded-xl border border-surface-border bg-surface p-5">
              <h2 className="mb-2 text-base font-semibold">{t("settings.appPreferences")}</h2>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t("settings.language")}</p>
                <LanguageSwitcher />
              </div>
              <div className="flex items-center justify-between border-t border-surface-border pt-3">
                <p className="text-sm font-medium">{t("settings.unitsDistance")}</p>
                <DistanceUnitSwitcher />
              </div>
              <div className="flex items-center justify-between border-t border-surface-border pt-3">
                <p className="text-sm font-medium">{t("settings.unitsConsumption")}</p>
                <ConsumptionFormatSwitcher />
              </div>
            </section>
          </div>

          {/* COLUMN 2: VEICOLI GARAGE & DANGER ZONE */}
          <div className="space-y-6">
            {/* I MIEI VEICOLI / GARAGE */}
            <section className="rounded-xl border border-surface-border bg-surface p-5">
              <p className="mb-3 text-base font-semibold">{t("appShell.myVehicles")}</p>
              <div className="flex flex-col gap-3">
                {vehicles.map((v) => (
                  <div key={v.id} className="rounded-lg border border-surface-border bg-bg/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{v.nickname}</p>
                        <p className="font-mono text-xs text-onsurface-variant">{v.vin}</p>
                      </div>
                      <Button variant="danger" size="sm" onClick={() => deleteVehicle(v.id, v.nickname)}>
                        {t("settings.deleteVehicle")}
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        placeholder={t("settings.newNamePlaceholder")}
                        value={editing[v.id] ?? ""}
                        onChange={(e) => setEditing((s) => ({ ...s, [v.id]: e.target.value }))}
                        className="min-w-0 flex-1 rounded-md border border-surface-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
                      />
                      <Button variant="secondary" size="sm" onClick={() => saveNickname(v.id)}>
                        {t("settings.rename")}
                      </Button>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 border-t border-surface-border pt-3">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <Button variant="secondary" size="sm" onClick={() => handleBackfillAddresses(v.id)} disabled={backfillBusy[v.id]}>
                          {backfillBusy[v.id] ? t("settings.backfillBusy") : t("settings.backfillButton")}
                        </Button>
                        {backfillStatus[v.id] && <span className="text-onsurface-variant">{backfillStatus[v.id]}</span>}
                      </div>
                      {hasElectricData(v.powertrain) && (
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <Button variant="secondary" size="sm" onClick={() => handleBackfillEnergyKm(v.id)} disabled={energyBackfillBusy[v.id]}>
                            {energyBackfillBusy[v.id] ? t("settings.energyBackfillBusy") : t("settings.energyBackfillButton")}
                          </Button>
                          {energyBackfillStatus[v.id] && <span className="text-onsurface-variant">{energyBackfillStatus[v.id]}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ZONA DI PERICOLO */}
            <section className="rounded-xl border border-bad/40 bg-bad/5 p-5">
              <p className="mb-1 text-sm font-medium text-bad">{t("settings.dangerZoneTitle")}</p>
              <p className="mb-3 text-sm text-onsurface-variant">{t("settings.deleteAccountDescription")}</p>
              {deleteAccountError && <p className="mb-3 text-sm text-bad">{deleteAccountError}</p>}
              <Button variant="danger" onClick={deleteAccount} disabled={deletingAccount}>
                {t("settings.deleteAccount")}
              </Button>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
