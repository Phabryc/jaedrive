import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-onsurface-variant">Caricamento...</div>;
  }
  if (!user) {
    // Preserves where the user was headed (e.g. /pair?code=XXXX from a QR scan) so Login
    // can send them back here after signing in instead of always landing on "/".
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
