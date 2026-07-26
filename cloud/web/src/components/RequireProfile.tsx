import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useProfile } from "../lib/ProfileContext";
import { useLanguage } from "../lib/i18n/LanguageContext";

// Sits inside ProtectedRoute (so a Firebase user already exists) and additionally enforces
// the mandatory profile fields (Nome/Cognome/Nazionalità) before letting anyone reach the
// rest of the app - see pages/Onboarding.tsx. Google sign-in prefills name server-side but
// never nationality, so this gate applies to every account at least once.
export function RequireProfile({ children }: { children: ReactNode }) {
  const { profile, loading } = useProfile();
  const location = useLocation();
  const { t } = useLanguage();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-onsurface-variant">{t("common.loading")}</div>;
  }
  if (profile && !profile.profileComplete) {
    // Preserves the original destination (e.g. /pair?code=XXXX from a QR scan) the same
    // way ProtectedRoute does for the login redirect - see Onboarding.tsx.
    return <Navigate to="/onboarding" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
