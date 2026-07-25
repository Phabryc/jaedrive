import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { api, type Profile } from "./api";

interface ProfileState {
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileState>({ profile: null, loading: true, refresh: async () => {} });

// Fetched once per session (not per-route) so RequireProfile checks on every protected page
// don't each trigger their own /me call - refresh() is exposed for Onboarding to call right
// after a successful PATCH, so the gate re-evaluates without a full reload.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setProfile(await api.me());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  return <ProfileContext.Provider value={{ profile, loading, refresh }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}
