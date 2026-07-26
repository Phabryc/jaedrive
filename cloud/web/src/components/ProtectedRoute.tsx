import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/i18n/LanguageContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-onsurface-variant">{t("common.loading")}</div>;
  }
  if (!user) {
    // Preserves where the user was headed (e.g. /pair?code=XXXX from a QR scan) so Login
    // can send them back here after signing in instead of always landing on "/".
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
