import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

export type SecretGiftConfig = {
  id: number;
  required_login_days: number;
  gift_title: string;
  gift_description: string;
  custom_message: string;
  image_urls: string[];
  video_urls: string[];
  audio_urls: string[];
  animation_key: string;
  one_time: boolean;
  admin_emails: string[];
  admin_session_minutes: number;
  updated_at: string;
};

export type SecretGiftProgress = {
  user_id: string;
  login_day_count: number;
  last_login_counted_date: string | null;
  first_login_date: string | null;
  gift_unlocked_at: string | null;
  gift_opened_at: string | null;
  notification_seen: boolean;
  updated_at: string;
};

export type AdminGiftRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  login_day_count: number;
  last_login_counted_date: string | null;
  first_login_date: string | null;
  gift_unlocked_at: string | null;
  gift_opened_at: string | null;
  notification_seen: boolean;
  updated_at: string;
  required_login_days: number;
};

export type GiftStatus = "locked" | "almost" | "ready" | "opened";

export function giftStatus(row: {
  login_day_count: number;
  gift_unlocked_at: string | null;
  gift_opened_at: string | null;
  required?: number;
}): GiftStatus {
  const req = row.required ?? 90;
  if (row.gift_opened_at) return "opened";
  if (row.gift_unlocked_at || row.login_day_count >= req) return "ready";
  if (row.login_day_count >= Math.max(0, req - 10)) return "almost";
  return "locked";
}

export function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type GiftState = {
  config: SecretGiftConfig | null;
  progress: SecretGiftProgress | null;
  loading: boolean;
  unlockOpen: boolean;
  notifyOpen: boolean;
  setUnlockOpen: (v: boolean) => void;
  setNotifyOpen: (v: boolean) => void;
  hydrate: () => Promise<void>;
  recordLoginDay: () => Promise<SecretGiftProgress | null>;
  markOpened: () => Promise<void>;
  markNotificationSeen: () => Promise<void>;
  refreshConfig: () => Promise<void>;
};

function parseConfig(raw: Record<string, unknown>): SecretGiftConfig {
  return {
    id: 1,
    required_login_days: Number(raw.required_login_days ?? 90),
    gift_title: String(raw.gift_title ?? "Your Secret Gift"),
    gift_description: String(raw.gift_description ?? ""),
    custom_message: String(raw.custom_message ?? ""),
    image_urls: Array.isArray(raw.image_urls) ? (raw.image_urls as string[]) : [],
    video_urls: Array.isArray(raw.video_urls) ? (raw.video_urls as string[]) : [],
    audio_urls: Array.isArray(raw.audio_urls) ? (raw.audio_urls as string[]) : [],
    animation_key: String(raw.animation_key ?? "cinematic-unlock"),
    one_time: raw.one_time !== false,
    admin_emails: Array.isArray(raw.admin_emails) ? (raw.admin_emails as string[]) : [],
    admin_session_minutes: Number(raw.admin_session_minutes ?? 30),
    updated_at: String(raw.updated_at ?? ""),
  };
}

const CONFIG_COLUMNS =
  "id,required_login_days,gift_title,gift_description,custom_message,image_urls,video_urls,audio_urls,animation_key,one_time,admin_emails,admin_session_minutes,updated_at";

export const useSecretGift = create<GiftState>((set, get) => ({
  config: null,
  progress: null,
  loading: true,
  unlockOpen: false,
  notifyOpen: false,
  setUnlockOpen: (v) => set({ unlockOpen: v }),
  setNotifyOpen: (v) => set({ notifyOpen: v }),

  refreshConfig: async () => {
    const { data, error } = await supabase
      .from("secret_gift_config")
      .select(CONFIG_COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.warn("[secret-gift] config", error.message);
      return;
    }
    if (data) set({ config: parseConfig(data as Record<string, unknown>) });
  },

  hydrate: async () => {
    set({ loading: true });
    try {
      await get().refreshConfig();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        set({ progress: null, loading: false });
        return;
      }
      const { data, error } = await supabase
        .from("secret_gift_progress")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) console.warn("[secret-gift] progress", error.message);
      set({ progress: (data as SecretGiftProgress | null) ?? null, loading: false });
    } catch (e) {
      console.warn(e);
      set({ loading: false });
    }
  },

  recordLoginDay: async () => {
    const today = localToday();
    const { data, error } = await supabase.rpc("record_secret_gift_login_day", {
      p_local_date: today,
    });
    if (error) {
      console.warn("[secret-gift] record day", error.message);
      return null;
    }
    const row = data;
    const prev = get().progress;
    set({ progress: row });

    const req = get().config?.required_login_days ?? 90;
    const justUnlocked =
      !!row.gift_unlocked_at &&
      (!prev?.gift_unlocked_at || (prev.login_day_count < req && row.login_day_count >= req));
    if (justUnlocked && !row.notification_seen) {
      set({ notifyOpen: true });
    } else if (row.gift_unlocked_at && !row.gift_opened_at && !row.notification_seen) {
      set({ notifyOpen: true });
    }
    return row;
  },

  markOpened: async () => {
    const { data, error } = await supabase.rpc("mark_secret_gift_opened");
    if (error) throw error;
    set({ progress: data, unlockOpen: false, notifyOpen: false });
  },

  markNotificationSeen: async () => {
    const { data, error } = await supabase.rpc("mark_secret_gift_notification_seen");
    if (error) {
      console.warn(error.message);
      return;
    }
    set({ progress: data, notifyOpen: false });
  },
}));

export async function adminListGiftProgress(): Promise<AdminGiftRow[]> {
  const { data, error } = await supabase.rpc("admin_secret_gift_progress_list");
  if (error) throw error;
  return data ?? [];
}

export async function adminAdjustDays(userId: string, delta: number) {
  const { data, error } = await supabase.rpc("admin_secret_gift_adjust_days", {
    p_user_id: userId,
    p_delta: delta,
  });
  if (error) throw error;
  return data;
}

export async function adminResetDays(userId: string) {
  const { data, error } = await supabase.rpc("admin_secret_gift_reset", {
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

export async function adminMarkOpened(userId: string) {
  const { data, error } = await supabase.rpc("admin_secret_gift_mark_opened", {
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

export async function adminSaveConfig(patch: Partial<SecretGiftConfig>) {
  const { data, error } = await supabase
    .from("secret_gift_config")
    .update({
      required_login_days: patch.required_login_days,
      gift_title: patch.gift_title,
      gift_description: patch.gift_description,
      custom_message: patch.custom_message,
      image_urls: patch.image_urls,
      video_urls: patch.video_urls,
      audio_urls: patch.audio_urls,
      animation_key: patch.animation_key,
      one_time: patch.one_time,
      admin_emails: patch.admin_emails,
      admin_session_minutes: patch.admin_session_minutes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select(CONFIG_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? parseConfig(data as Record<string, unknown>) : null;
}
