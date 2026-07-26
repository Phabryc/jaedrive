import { useState } from "react";
import { Navigate, useLocation, useNavigate, type Location } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useLanguage, type TranslationKey } from "../lib/i18n/LanguageContext";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ApiError } from "../lib/api";
import jdLogo from "../assets/jd_logo.png";

export default function Login() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by ProtectedRoute when it bounced an unauthenticated visitor here - e.g. someone
  // scanning the car's pairing QR code lands on /pair?code=XXXX first, then here, then
  // should go straight back to /pair?code=XXXX instead of the generic dashboard.
  const from = (location.state as { from?: Location } | null)?.from;
  const redirectTarget = from ? from.pathname + from.search : "/dashboard";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={redirectTarget} replace />;

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
      navigate(redirectTarget);
    } catch (err) {
      setError(friendlyError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate(redirectTarget);
    } catch (err) {
      setError(friendlyError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <img src={jdLogo} alt="JaeDrive" className="h-10 w-auto" />
          <LanguageSwitcher />
        </div>
        <p className="mb-6 text-sm text-onsurface-variant">
          {mode === "signin" ? t("login.signinSubtitle") : t("login.signupSubtitle")}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder={t("common.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-surface-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder={t("common.password")}
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
            {mode === "signin" ? t("common.login") : t("login.signupButton")}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2 text-xs text-onsurface-variant">
          <div className="h-px flex-1 bg-surface-border" />
          {t("common.or")}
          <div className="h-px flex-1 bg-surface-border" />
        </div>

        <button
          onClick={handleGoogle}
          disabled={busy}
          className="flex w-full items-center justify-center gap-3 rounded-md border border-[#dadce0] bg-white px-3 py-2 text-sm font-medium text-[#3c4043] shadow-sm transition hover:bg-[#f8f9fa] hover:shadow disabled:opacity-50"
        >
          <GoogleIcon />
          {t("login.continueWithGoogle")}
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-onsurface-variant hover:text-onsurface"
        >
          {mode === "signin" ? t("login.switchToSignup") : t("login.switchToSignin")}
        </button>

        <p className="mt-4 text-center text-[11px] text-onsurface-variant">
          <a href="/legal/eula" className="hover:text-onsurface hover:underline">
            {t("legal.terms")}
          </a>
          <span className="mx-1.5">·</span>
          <a href="/legal/privacy" className="hover:text-onsurface hover:underline">
            {t("legal.privacy")}
          </a>
        </p>
      </div>
    </div>
  );
}

// Google's official multicolor "G" mark, per Google's brand guidelines for "Sign in with
// Google" buttons - kept as a white/light button (not dark-themed) specifically so it
// reads as unmistakably Google at a glance, even sitting on this app's otherwise dark UI.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

function friendlyError(err: unknown, t: (key: TranslationKey) => string): string {
  if (err instanceof ApiError) return err.message;
  const code = (err as { code?: string })?.code ?? "";
  // Logged raw so the real Firebase error code/message is always visible in devtools, even
  // for cases not explicitly mapped below.
  console.error("Auth error:", err);
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return t("login.error.wrongPassword");
  if (code.includes("email-already-in-use")) return t("login.error.emailInUse");
  if (code.includes("weak-password")) return t("login.error.weakPassword");
  if (code.includes("user-not-found")) return t("login.error.userNotFound");
  if (code.includes("unauthorized-domain")) return t("login.error.unauthorizedDomain");
  if (code.includes("operation-not-allowed")) return t("login.error.operationNotAllowed");
  if (code.includes("popup-blocked")) return t("login.error.popupBlocked");
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return "";
  return t("common.genericError");
}
