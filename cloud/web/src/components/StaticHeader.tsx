import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { buttonVariants } from "./Button";
import jdLogo from "../assets/jd_logo.png";

export function StaticHeader() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  const isPlans = location.pathname === "/plans";
  const isFeatures = location.pathname === "/features";

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        {/* Logo e tasti Piani/Funzionalità a sinistra */}
        <div className="flex items-center gap-6">
          <Link to="/" aria-label="JaeDrive home" className="shrink-0">
            <img src={jdLogo} alt="JaeDrive" className="h-7 w-auto" />
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              to="/features"
              className={`text-sm font-medium underline-offset-4 hover:underline transition ${
                isFeatures ? "text-accent font-semibold" : "text-onsurface-variant hover:text-onsurface"
              }`}
            >
              {t("landing.featuresLink")}
            </Link>
            <Link
              to="/plans"
              className={`text-sm font-medium underline-offset-4 hover:underline transition ${
                isPlans ? "text-accent font-semibold" : "text-onsurface-variant hover:text-onsurface"
              }`}
            >
              {t("landing.plansLink")}
            </Link>
          </nav>
        </div>

        {/* Cambio lingua e pulsante Login / Dashboard a destra */}
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {user ? (
            <Link to="/dashboard" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Dashboard
            </Link>
          ) : (
            <Link to="/login" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("common.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
