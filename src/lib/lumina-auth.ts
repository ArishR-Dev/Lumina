import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  setSession: (session: Session | null) => void;
  setProfile: (p: { displayName: string | null; avatarUrl: string | null }) => void;
  setLoading: (v: boolean) => void;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  displayName: null,
  avatarUrl: null,
  setSession: (session) => set({ session, user: session?.user ?? null, loading: false }),
  setProfile: (p) => set({ displayName: p.displayName, avatarUrl: p.avatarUrl }),
  setLoading: (v) => set({ loading: v }),
}));

let listenerBound = false;
export function bindAuthListener() {
  if (listenerBound || typeof window === "undefined") return;
  listenerBound = true;

  supabase.auth.getSession().then(({ data }) => {
    useAuth.getState().setSession(data.session ?? null);
    if (data.session) void loadProfile(data.session.user.id);
  });

  supabase.auth.onAuthStateChange((event, session) => {
    useAuth.getState().setSession(session ?? null);
    if (session && (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED")) {
      void loadProfile(session.user.id);
    }
    if (event === "SIGNED_OUT") {
      useAuth.getState().setProfile({ displayName: null, avatarUrl: null });
    }
  });
}

async function loadProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (data) {
    useAuth.getState().setProfile({
      displayName: data.display_name ?? null,
      avatarUrl: data.avatar_url ?? null,
    });
  }
}

export async function signOutClean() {
  const { supabase } = await import("@/integrations/supabase/client");
  await supabase.auth.signOut();
  // Clear the persisted local store so a different signed-in user on the same
  // device does not inherit the previous user's data.
  try {
    localStorage.removeItem("lumina-storage");
  } catch {
    /* noop */
  }
  window.location.href = "/auth";
}
