import { Link, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Button } from "./Button";
import jdLogo from "../assets/jd_logo.png";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-bg text-onsurface">
      <header className="sticky top-0 z-10 border-b border-surface-border bg-bg/90 backdrop-blur">
        {/* flex-wrap + gap-y sul contenitore esterno: sotto sm il logo e la nav diventano
            due righe invece di stringersi in una sola (era il bug reale trovato con uno
            screenshot mobile - "My"/"vehicles" e "Log"/"out" andavano a capo a META' parola).
            whitespace-nowrap su ogni voce fa si' che, se anche la nav da sola non ci sta su
            una riga, vada a capo un elemento intero alla volta, mai dentro una singola parola. */}
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/dashboard" className="shrink-0">
            <img src={jdLogo} alt="JaeDrive" className="h-7 w-auto" />
          </Link>
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-onsurface-variant sm:gap-x-4">
            <Link to="/dashboard" className="whitespace-nowrap hover:text-onsurface">
              {t("appShell.myVehicles")}
            </Link>
            <Link to="/settings" className="whitespace-nowrap hover:text-onsurface">
              {t("appShell.settings")}
            </Link>
            <span className="hidden whitespace-nowrap sm:inline">{user?.email}</span>
            <LanguageSwitcher />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => signOut(auth).then(() => navigate("/login"))}
              className="whitespace-nowrap"
            >
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
