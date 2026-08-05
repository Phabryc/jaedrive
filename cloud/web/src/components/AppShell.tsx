import { Link, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { IconSettings, IconLogout, IconAdmin } from "./icons";
import jdLogo from "../assets/jd_logo.png";
import { useProfile } from "../lib/ProfileContext";

import { clearEnteredAppSession } from "../lib/session";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleLogout() {
    clearEnteredAppSession();
    setUserMenuOpen(false);
    signOut(auth).then(() => navigate("/login"));
  }

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = ((profile?.firstName?.[0] ?? "") + (profile?.lastName?.[0] ?? "")).toUpperCase() || "U";

  return (
    <div className="min-h-screen bg-bg text-onsurface">
      <header className="sticky top-0 z-40 border-b border-surface-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* LOGO & NAVIGATION */}
          <div className="flex items-center gap-6">
            <Link to="/" aria-label="JaeDrive home" className="shrink-0">
              <img src={jdLogo} alt="JaeDrive" className="h-7 w-auto" />
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link to="/dashboard" className="text-onsurface hover:text-accent transition">
                {t("appShell.myVehicles")}
              </Link>
            </nav>
          </div>

          {/* USER AVATAR & DROPDOWN MENU */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((open) => !open)}
              className={`flex items-center gap-2 rounded-full p-0.5 transition outline-none focus:ring-2 focus:ring-accent ${
                profile?.role === "ADMIN" ? "ring-2 ring-accent/60" : "hover:ring-2 hover:ring-surface-border"
              }`}
              aria-expanded={userMenuOpen}
              aria-label="User menu"
            >
              {profile?.photoUrl ? (
                <img
                  src={profile.photoUrl}
                  alt={profile.firstName ?? "Avatar"}
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-border text-xs font-bold text-onsurface-variant">
                  {initials}
                </div>
              )}
            </button>

            {/* DROPDOWN POPOVER - 100% OPAQUE BACKGROUND */}
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-2xl border border-surface-border bg-[#14161a] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95">
                {/* USER INFO HEADER */}
                <div className="flex items-center gap-3 p-2 border-b border-surface-border pb-3">
                  {profile?.photoUrl ? (
                    <img src={profile.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-border text-sm font-bold text-onsurface-variant">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold">
                        {profile?.firstName} {profile?.lastName}
                      </p>
                      {profile?.role === "ADMIN" && (
                        <span className="shrink-0 rounded bg-sky-500/20 px-1.5 py-0.2 text-[10px] font-bold text-sky-400">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-onsurface-variant">{user?.email}</p>
                  </div>
                </div>

                {/* MENU LINKS */}
                <div className="py-2 space-y-1">
                  {profile?.role === "ADMIN" && (
                    <Link
                      to="/admin"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition"
                    >
                      <IconAdmin size={16} />
                      <span>{t("admin.title")}</span>
                    </Link>
                  )}
                  <Link
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-onsurface-variant hover:bg-bg hover:text-onsurface transition"
                  >
                    <IconSettings size={16} />
                    <span>{t("settings.titleUnified")}</span>
                  </Link>
                </div>

                {/* LANGUAGE SWITCHER */}
                <div className="border-t border-surface-border pt-2 pb-1 px-3 flex items-center justify-between text-xs text-onsurface-variant">
                  <span>Language / Lingua</span>
                  <LanguageSwitcher />
                </div>

                {/* LOGOUT BUTTON */}
                <div className="border-t border-surface-border pt-2 mt-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <span>{t("appShell.logout")}</span>
                    <IconLogout size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
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
