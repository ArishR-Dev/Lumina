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
    if (data.session) void hydrateProfile(data.session.user);
  });

  supabase.auth.onAuthStateChange((event, session) => {
    useAuth.getState().setSession(session ?? null);
    if (session && (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED")) {
      void hydrateProfile(session.user);
    }
    if (event === "SIGNED_OUT") {
      useAuth.getState().setProfile({ displayName: null, avatarUrl: null });
    }
  });
}

/** Pull Google / OAuth identity fields from the auth user. */
export function getOAuthProfileFields(user: User) {
  const meta = user.user_metadata ?? {};
  const googleIdentity = user.identities?.find((i) => i.provider === "google");
  const googleId =
    (typeof meta.provider_id === "string" && meta.provider_id) ||
    (typeof meta.sub === "string" && meta.sub) ||
    googleIdentity?.id ||
    null;
  const displayName =
    (typeof meta.display_name === "string" && meta.display_name) ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (user.email ? user.email.split("@")[0] : null);
  const avatarUrl =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;

  return {
    googleId,
    email: user.email ?? null,
    displayName,
    avatarUrl,
  };
}

/**
 * Ensure `profiles` has name + avatar from Google (or other OAuth metadata).
 * Email and Google ID live on `auth.users` / identities; we mirror display fields.
 */
export async function syncAuthUserProfile(user: User) {
  const fields = getOAuthProfileFields(user);
  const patch: { display_name?: string; avatar_url?: string } = {};
  if (fields.displayName) patch.display_name = fields.displayName;
  if (fields.avatarUrl) patch.avatar_url = fields.avatarUrl;

  if (Object.keys(patch).length > 0) {
    await supabase.from("profiles").update(patch).eq("id", user.id);
  }

  useAuth.getState().setProfile({
    displayName: fields.displayName,
    avatarUrl: fields.avatarUrl,
  });
}

async function hydrateProfile(user: User) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const oauth = getOAuthProfileFields(user);
  const displayName = data?.display_name ?? oauth.displayName;
  const avatarUrl = data?.avatar_url ?? oauth.avatarUrl;

  // Fill gaps left by the signup trigger (Google often sends `picture`).
  if ((!data?.display_name && oauth.displayName) || (!data?.avatar_url && oauth.avatarUrl)) {
    void syncAuthUserProfile(user);
    return;
  }

  useAuth.getState().setProfile({
    displayName: displayName ?? null,
    avatarUrl: avatarUrl ?? null,
  });
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
