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

function parseVerifyResult(data: unknown): { ok: boolean; expiresAt: string | null } {
  if (!data || typeof data !== "object") return { ok: false, expiresAt: null };
  const row = data as Record<string, unknown>;
  const ok = row.ok === true;
  const raw = row.expires_at ?? row.expiresAt;
  const expiresAt = typeof raw === "string" && raw.length > 0 ? raw : null;
  return { ok, expiresAt };
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase.rpc("verify_admin_password", {
      p_password: password.trim(),
    });
    if (error) return false;
    const { ok, expiresAt } = parseVerifyResult(data);
    if (!ok || !expiresAt) return false;
    writeStoredExpiry(expiresAt);
    set({ expiresAt, modalOpen: false });
    return true;
  },

  touchSession: async () => {
    if (!get().isSessionActive()) return false;
    const { data, error } = await supabase.rpc("touch_admin_session");
    if (error) {
      console.warn("[admin-access] touch", error.message);
      return false;
    }
    const result = parseVerifyResult(data);
    if (!result.ok || !result.expiresAt) {
      writeStoredExpiry(null);
      set({ expiresAt: null });
      return false;
    }
    writeStoredExpiry(result.expiresAt);
    set({ expiresAt: result.expiresAt });
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

/** Opens the password modal — used by secret triggers. Requires logged-in user. */
export async function requestHiddenAdminAccess(navigateAfter = true) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  useAdminAccess.getState().requestAccess(navigateAfter);
}

export function isHiddenAdminSessionActive(): boolean {
  return useAdminAccess.getState().isSessionActive();
}

export const ADMIN_IDLE_MS = DEFAULT_IDLE_MS;
