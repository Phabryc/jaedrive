import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { AppShell } from "../components/AppShell";

export default function Pair() {
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
      setError(err instanceof ApiError ? err.message : "Codice non valido o scaduto.");
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

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-xl font-semibold">Aggiungi auto</h1>
        {autoClaiming ? (
          <p className="mb-6 text-sm text-onsurface-variant">Codice rilevato dal QR, associazione in corso...</p>
        ) : (
          <p className="mb-6 text-sm text-onsurface-variant">
            Apri JaeDrive sull'auto: nella pagina di associazione viene mostrato un codice a 8
            caratteri (o un QR da inquadrare). Inseriscilo qui per collegare l'auto al tuo account.
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            autoFocus
            required
            placeholder="Es. K7H2P9QX"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={16}
            className="rounded-md border border-surface-border bg-surface px-3 py-3 text-center text-lg tracking-[0.3em] outline-none focus:border-accent"
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.trim().length < 4}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
          >
            Collega auto
          </button>
        </form>
      </div>
    </AppShell>
  );
}
