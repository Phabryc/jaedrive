import { useState } from "react";
import { useLocation, useNavigate, type Location } from "react-router-dom";
import { api, ApiError, type Profile } from "../lib/api";
import { useProfile } from "../lib/ProfileContext";
import jdLogo from "../assets/jd_logo.png";

export default function Onboarding() {
  const { profile, refresh } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from;
  const redirectTarget = from ? from.pathname + from.search : "/";

  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const updated: Profile = await api.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      if (!updated.profileComplete) throw new Error("Profilo incompleto");
      await refresh();
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Si è verificato un errore. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface p-6">
        <img src={jdLogo} alt="JaeDrive" className="mb-4 h-10 w-auto" />
        <h1 className="mb-1 text-lg font-semibold">Completa il profilo</h1>
        <p className="mb-6 text-sm text-onsurface-variant">
          Ci servono questi dati prima di continuare.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            autoFocus
            required
            placeholder="Nome"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded-md border border-surface-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            required
            placeholder="Cognome"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="rounded-md border border-surface-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
          >
            Continua
          </button>
        </form>
      </div>
    </div>
  );
}
