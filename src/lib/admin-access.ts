import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lumina-admin-session-expires";
const DEFAULT_IDLE_MS = 30 * 60 * 1000;

type AdminAccessState = {
  expiresAt: string | null;
  modalOpen: boolean;
  pendingNavigate: boolean;
  setModalOpen: (open: boolean, navigateAfter?: boolean) => void;
  requestAccess: (navigateAfter?: boolean) => void;
  isSessionActive: () => boolean;
  verifyPassword: (password: string) => Promise<boolean>;
  touchSession: () => Promise<boolean>;
  clearSession: () => Promise<void>;
  hydrateFromStorage: () => void;
};

/** Milliseconds until the stored session expires (fallback: 30 min). */
export function adminSessionIdleMs(): number {
  const exp = useAdminAccess.getState().expiresAt ?? readStoredExpiry();
  if (!exp) return DEFAULT_IDLE_MS;
  return Math.max(5_000, new Date(exp).getTime() - Date.now());
}

function readStoredExpiry(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredExpiry(expiresAt: string | null) {
  try {
    if (expiresAt) sessionStorage.setItem(STORAGE_KEY, expiresAt);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function isFuture(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

export const useAdminAccess = create<AdminAccessState>((set, get) => ({
  expiresAt: null,
  modalOpen: false,
  pendingNavigate: false,

  setModalOpen: (open, navigateAfter = false) => {
    if (open) {
      set({ modalOpen: true, pendingNavigate: navigateAfter || get().pendingNavigate });
    } else {
      set({ modalOpen: false, pendingNavigate: false });
    }
  },

  requestAccess: (navigateAfter = false) => {
    if (get().isSessionActive()) {
      if (navigateAfter) set({ pendingNavigate: true, modalOpen: false });
      return;
    }
    set({ modalOpen: true, pendingNavigate: navigateAfter });
  },

  isSessionActive: () => isFuture(get().expiresAt ?? readStoredExpiry()),

  hydrateFromStorage: () => {
    const stored = readStoredExpiry();
    if (isFuture(stored)) set({ expiresAt: stored });
    else {
      writeStoredExpiry(null);
      set({ expiresAt: null });
    }
  },

  verifyPassword: async (password) => {
    const { data, error } = await supabase.rpc("verify_admin_password", {
      p_password: password,
    });
    if (error) {
      console.warn("[admin-access] verify", error.message);
      return false;
    }
    const result = data as { ok?: boolean; expires_at?: string } | null;
    if (!result?.ok || !result.expires_at) return false;
    writeStoredExpiry(result.expires_at);
    set({ expiresAt: result.expires_at, modalOpen: false });
    return true;
  },

  touchSession: async () => {
    if (!get().isSessionActive()) return false;
    const { data, error } = await supabase.rpc("touch_admin_session");
    if (error) {
      console.warn("[admin-access] touch", error.message);
      return false;
    }
    const result = data as { ok?: boolean; expires_at?: string } | null;
    if (!result?.ok || !result.expires_at) {
      writeStoredExpiry(null);
      set({ expiresAt: null });
      return false;
    }
    writeStoredExpiry(result.expires_at);
    set({ expiresAt: result.expires_at });
    return true;
  },

  clearSession: async () => {
    writeStoredExpiry(null);
    set({ expiresAt: null, modalOpen: false, pendingNavigate: false });
    try {
      await supabase.rpc("revoke_admin_session");
    } catch {
      /* ignore */
    }
  },
}));

/** Opens the password modal — used by secret triggers. Does nothing if not logged in. */
export function requestHiddenAdminAccess(navigateAfter = true) {
  useAdminAccess.getState().requestAccess(navigateAfter);
}

export function isHiddenAdminSessionActive(): boolean {
  return useAdminAccess.getState().isSessionActive();
}

export const ADMIN_IDLE_MS = DEFAULT_IDLE_MS;
