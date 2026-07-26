import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { api, ApiError } from "../lib/api";
import type { Vehicle } from "../lib/types";
import { AppShell } from "../components/AppShell";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
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
    </AppShell>
  );
}
