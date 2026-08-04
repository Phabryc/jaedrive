import { Link, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Button, buttonVariants } from "./Button";
import { IconSettings } from "./icons";
import jdLogo from "../assets/jd_logo.png";
import { useProfile } from "../lib/ProfileContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { t } = useLanguage();

  function handleLogout() {
    signOut(auth).then(() => navigate("/login"));
  }

  return (
    <div className="min-h-screen bg-bg text-onsurface">
      <header className="sticky top-0 z-10 border-b border-surface-border bg-bg/90 backdrop-blur">
        {/* Sotto sm: due righe (logo centrato sopra, "Le mie auto"/pulsante a sx e il resto
            a dx sotto) invece di stringere tutto in un'unica riga - richiesta esplicita
            2026-08-02, la vecchia riga singola risultava illeggibile su schermo stretto.
            Da sm in su resta la riga singola originale, invariata. */}
        <div className="mx-auto flex max-w-[1800px] flex-col gap-2 px-4 py-3 sm:hidden">
          <Link to="/dashboard" className="flex justify-center">
            <img src={jdLogo} alt="JaeDrive" className="h-7 w-auto" />
          </Link>
          <div className="flex items-center justify-between gap-2">
            <Link to="/dashboard" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("appShell.myVehicles")}
            </Link>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              {profile?.role === "ADMIN" && (
                <Link to="/admin" className={buttonVariants({ variant: "secondary", size: "sm", className: "px-2 text-accent" })}>
                  {t("admin.title")}
                </Link>
              )}
              <Link
                to="/settings"
                aria-label={t("appShell.settings")}
                className={buttonVariants({ variant: "secondary", size: "sm", className: "px-2.5" })}
              >
                <IconSettings size={16} />
              </Link>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                {t("appShell.logout")}
              </Button>
            </div>
          </div>
        </div>
        <div className="mx-auto hidden max-w-[1800px] items-center justify-between gap-x-4 px-4 py-3 sm:flex sm:px-6 lg:px-8">
          <Link to="/dashboard" className="shrink-0">
            <img src={jdLogo} alt="JaeDrive" className="h-7 w-auto" />
          </Link>
          <nav className="flex items-center gap-x-4 text-sm text-onsurface-variant">
            {profile?.role === "ADMIN" && (
              <Link to="/admin" className="whitespace-nowrap font-medium text-accent hover:text-accent/80">
                {t("admin.title")}
              </Link>
            )}
            <Link to="/dashboard" className="whitespace-nowrap hover:text-onsurface">
              {t("appShell.myVehicles")}
            </Link>
            <Link to="/settings" className="whitespace-nowrap hover:text-onsurface">
              {t("settings.titleUnified")}
            </Link>
            <span className="whitespace-nowrap">{user?.email}</span>
            <LanguageSwitcher />
            <Button variant="secondary" size="sm" onClick={handleLogout} className="whitespace-nowrap">
              {t("appShell.logout")}
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <footer className="mx-auto max-w-[1800px] px-4 pb-6 text-xs text-onsurface-variant sm:px-6 lg:px-8">
        <Link to="/legal/eula" className="hover:text-onsurface hover:underline">
          {t("legal.terms")}
        </Link>
        <span className="mx-2">·</span>
        <Link to="/legal/privacy" className="hover:text-onsurface hover:underline">
          {t("legal.privacy")}
        </Link>
      </footer>
    </div>
  );
}
