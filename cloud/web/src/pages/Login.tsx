import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { ApiError } from "../lib/api";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate("/");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate("/");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface p-6">
        <h1 className="mb-1 text-xl font-semibold text-accent">JaeDrive</h1>
        <p className="mb-6 text-sm text-onsurface-variant">
          {mode === "signin" ? "Accedi al tuo account" : "Crea un nuovo account"}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-surface-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-surface-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
          >
            {mode === "signin" ? "Accedi" : "Registrati"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2 text-xs text-onsurface-variant">
          <div className="h-px flex-1 bg-surface-border" />
          oppure
          <div className="h-px flex-1 bg-surface-border" />
        </div>

        <button
          onClick={handleGoogle}
          disabled={busy}
          className="w-full rounded-md border border-surface-border px-3 py-2 text-sm hover:border-accent disabled:opacity-50"
        >
          Continua con Google
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-onsurface-variant hover:text-onsurface"
        >
          {mode === "signin" ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
        </button>
      </div>
    </div>
  );
}

function friendlyError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  const code = (err as { code?: string })?.code ?? "";
  // Logged raw so the real Firebase error code/message is always visible in devtools, even
  // for cases not explicitly mapped below.
  console.error("Auth error:", err);
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Email o password errati.";
  if (code.includes("email-already-in-use")) return "Esiste già un account con questa email.";
  if (code.includes("weak-password")) return "Password troppo corta (minimo 6 caratteri).";
  if (code.includes("user-not-found")) return "Nessun account con questa email.";
  if (code.includes("unauthorized-domain"))
    return "Questo dominio non è autorizzato per l'accesso Google. Aggiungilo in Firebase Console → Authentication → Settings → Authorized domains.";
  if (code.includes("operation-not-allowed"))
    return "L'accesso con Google non è abilitato per questo progetto Firebase (Authentication → Sign-in method).";
  if (code.includes("popup-blocked"))
    return "Il browser ha bloccato il popup di accesso Google. Consenti i popup per questo sito e riprova.";
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return "";
  return "Si è verificato un errore. Riprova.";
}
