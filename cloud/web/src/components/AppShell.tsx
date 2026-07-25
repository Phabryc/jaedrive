import { Link, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg text-onsurface">
      <header className="sticky top-0 z-10 border-b border-surface-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight text-accent">
            JaeDrive
          </Link>
          <nav className="flex items-center gap-4 text-sm text-onsurface-variant">
            <Link to="/" className="hover:text-onsurface">
              Le mie auto
            </Link>
            <Link to="/settings" className="hover:text-onsurface">
              Impostazioni
            </Link>
            <span className="hidden sm:inline">{user?.email}</span>
            <button
              onClick={() => signOut(auth).then(() => navigate("/login"))}
              className="rounded-md border border-surface-border px-3 py-1 hover:border-accent hover:text-onsurface"
            >
              Esci
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
