import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/Button";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { useProfile } from "../lib/ProfileContext";

// Deve restare in linea con la finestra di grazia server (CONFIRMATION_GRACE_MS in
// cloud/server/src/cron/pairingCleanup.ts, 30s) con un margine per il round-trip di rete -
// se il polling qui scade prima che il server pulisca il device, il prossimo giro di
// polling lo avrebbe comunque trovato non confermato; nessun danno, solo un timeout percepito
// leggermente in anticipo rispetto alla pulizia server.
const CONFIRM_POLL_INTERVAL_MS = 2000;
const CONFIRM_TIMEOUT_MS = 35000;

export default function Pair() {
  const { profile } = useProfile();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get("code");
  const [code, setCode] = useState(codeFromUrl?.toUpperCase() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // "idle": form di inserimento codice. "waiting": codice accettato, in attesa che l'app
  // sull'auto completi l'handshake (vedi waitForConfirmation) - qui il redirect alla pagina
  // viaggi NON parte piu' al solo claim (vedi agent_log.md 2026-08-06): il claim crea
  // gia' Vehicle/Device lato server, ma solo l'handshake prova che l'app li abbia ricevuti.
  const [phase, setPhase] = useState<"idle" | "waiting">("idle");
  // Guards the auto-submit-from-QR-link effect below so it fires at most once, even if the
  // component re-renders before the claim request resolves.
  const autoSubmitted = useRef(false);
  // Evita setState dopo unmount se l'utente naviga via mentre il polling e' in corso.
  const cancelledRef = useRef(false);
  useEffect(() => () => { cancelledRef.current = true; }, []);

  async function claim(value: string) {
    setError(null);
    setBusy(true);
    try {
      const { vehicleId, deviceId } = await api.claimPairingCode(value.trim());
      setBusy(false);
      setPhase("waiting");
      waitForConfirmation(vehicleId, deviceId, Date.now() + CONFIRM_TIMEOUT_MS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("pair.invalidCode"));
      setBusy(false);
    }
  }

  async function waitForConfirmation(vehicleId: string, deviceId: string, deadline: number) {
    if (cancelledRef.current) return;
    try {
      const { confirmed } = await api.deviceConfirmStatus(deviceId);
      if (confirmed) {
        navigate(`/vehicles/${vehicleId}/trips`);
        return;
      }
    } catch (err) {
      // 404 = il device e' stato ripulito lato server perche' mai confermato (vedi
      // cron/pairingCleanup.ts) - un fallimento definitivo, non ha senso continuare a
      // pollare. Altri errori (rete transitoria) vengono invece ignorati e ritentati finche'
      // non scade il timeout locale.
      if (err instanceof ApiError && err.status === 404) {
        if (!cancelledRef.current) {
          setPhase("idle");
          setError(t("pair.handshakeFailed"));
        }
        return;
      }
    }
    if (Date.now() >= deadline) {
      if (!cancelledRef.current) {
        setPhase("idle");
        setError(t("pair.handshakeTimeout"));
      }
      return;
    }
    setTimeout(() => waitForConfirmation(vehicleId, deviceId, deadline), CONFIRM_POLL_INTERVAL_MS);
  }

  useEffect(() => {
    // Arrived via the car's pairing QR code (https://jaedrive.com/pair?code=XXXX) - claim
    // immediately instead of making the user retype what they just scanned.
    if (codeFromUrl && codeFromUrl.trim().length >= 4 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      claim(codeFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    claim(code);
  }

  const autoClaiming = busy && autoSubmitted.current && !error;

  if (profile?.subscription?.status !== "PREMIUM") {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center shadow-lg">
          <h2 className="mb-2 text-lg font-bold text-amber-400">{t("pair.premiumRequired")}</h2>
          <p className="text-sm text-onsurface-variant mb-4">
            {t("pair.premiumRequiredDesc")}
          </p>
          <div className="rounded-lg border border-surface-border bg-surface p-4 text-left">
            <p className="text-xs font-semibold text-onsurface-variant mb-2">{t("pair.havePromoCode")}</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formEl = e.currentTarget;
                const input = (formEl.elements.namedItem("promo") as HTMLInputElement).value;
                if (!input.trim()) return;
                try {
                  const res = await api.redeemDiscountCode(input.trim());
                  alert(res.message);
                  window.location.reload();
                } catch (err: any) {
                  alert(err.message || "Codice non valido");
                }
              }}
              className="flex gap-2"
            >
              <input
                name="promo"
                type="text"
                placeholder={t("settings.redeemPlaceholder")}
                className="min-w-0 flex-1 rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm uppercase outline-none focus:border-accent"
                required
              />
              <Button type="submit" variant="secondary" size="sm">
                {t("pair.redeemShort")}
              </Button>
            </form>
          </div>
        </div>
      </AppShell>
    );
  }

  if (phase === "waiting") {
    return (
      <AppShell>
        <div className="mx-auto max-w-md text-center">
          <h1 className="mb-4 text-xl font-semibold">{t("pair.title")}</h1>
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-onsurface-variant">{t("pair.waitingForApp")}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-xl font-semibold">{t("pair.title")}</h1>
        {autoClaiming ? (
          <p className="mb-6 text-sm text-onsurface-variant">{t("pair.autoClaiming")}</p>
        ) : (
          <p className="mb-6 text-sm text-onsurface-variant">{t("pair.instructions")}</p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            autoFocus
            required
            placeholder={t("pair.placeholderExample")}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={16}
            className="rounded-md border border-surface-border bg-surface px-3 py-3 text-center text-lg tracking-[0.3em] outline-none focus:border-accent"
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <Button type="submit" variant="primary" disabled={busy || code.trim().length < 4} className="w-full">
            {t("pair.submitButton")}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
