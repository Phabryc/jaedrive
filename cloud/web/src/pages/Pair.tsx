import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/Button";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { useProfile } from "../lib/ProfileContext";

export default function Pair() {
  const { profile } = useProfile();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get("code");
  const [code, setCode] = useState(codeFromUrl?.toUpperCase() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Guards the auto-submit-from-QR-link effect below so it fires at most once, even if the
  // component re-renders before the claim request resolves.
  const autoSubmitted = useRef(false);

  async function claim(value: string) {
    setError(null);
    setBusy(true);
    try {
      const { vehicleId } = await api.claimPairingCode(value.trim());
      navigate(`/vehicles/${vehicleId}/trips`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("pair.invalidCode"));
    } finally {
      setBusy(false);
    }
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
          <h2 className="mb-2 text-lg font-bold text-amber-400">Abbonamento Premium Richiesto</h2>
          <p className="text-sm text-onsurface-variant mb-4">
            Per accoppiare l'Headunit dell'auto al Cloud e sincronizzare i tuoi viaggi è necessario un abbonamento Premium attivo.
          </p>
          <div className="rounded-lg border border-surface-border bg-surface p-4 text-left">
            <p className="text-xs font-semibold text-onsurface-variant mb-2">Hai un codice promo / sconto?</p>
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
                placeholder="Es: PROMO2026"
                className="min-w-0 flex-1 rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm uppercase outline-none focus:border-accent"
                required
              />
              <Button type="submit" variant="secondary" size="sm">
                Riscatta
              </Button>
            </form>
          </div>
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
