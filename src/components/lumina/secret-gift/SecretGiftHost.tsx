import { useEffect } from "react";

import { useAuth } from "@/lib/lumina-auth";

import { useSecretGift, type SecretGiftProgress } from "@/lib/secret-gift";

import { supabase } from "@/integrations/supabase/client";

import { SecretGiftNotification } from "./SecretGiftNotification";

import { SecretGiftUnlock } from "./SecretGiftUnlock";

/** Mount once in the app shell: hydrate, count today's login day, host overlays. */

export function SecretGiftHost() {
  const userId = useAuth((s) => s.user?.id);

  const hydrate = useSecretGift((s) => s.hydrate);

  const recordLoginDay = useSecretGift((s) => s.recordLoginDay);

  const config = useSecretGift((s) => s.config);

  const progress = useSecretGift((s) => s.progress);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      await hydrate();

      if (cancelled) return;

      await recordLoginDay();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, hydrate, recordLoginDay]);

  // Live progress updates (e.g. admin adjusts days while user is online)

  useEffect(() => {
    if (!userId) return;

    const channel = supabase

      .channel(`secret-gift-${userId}`)

      .on(
        "postgres_changes",

        {
          event: "*",

          schema: "public",

          table: "secret_gift_progress",

          filter: `user_id=eq.${userId}`,
        },

        (payload) => {
          const row = payload.new as SecretGiftProgress;

          if (!row?.user_id) return;

          const prev = useSecretGift.getState().progress;

          useSecretGift.setState({ progress: row });

          const req = useSecretGift.getState().config?.required_login_days ?? 90;

          const justUnlocked =
            !!row.gift_unlocked_at &&
            (!prev?.gift_unlocked_at || (prev.login_day_count < req && row.login_day_count >= req));

          if (justUnlocked && !row.notification_seen) {
            useSecretGift.setState({ notifyOpen: true });
          }
        },
      )

      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Re-show notification only when store doesn't already show it (recordLoginDay handles fresh unlock)
  useEffect(() => {
    if (!progress || !config) return;
    const { notifyOpen } = useSecretGift.getState();
    if (notifyOpen) return;
    if (progress.gift_unlocked_at && !progress.gift_opened_at && !progress.notification_seen) {
      useSecretGift.setState({ notifyOpen: true });
    }
  }, [progress?.gift_unlocked_at, progress?.gift_opened_at, progress?.notification_seen, config]);

  if (!userId) return null;

  return (
    <>
      <SecretGiftNotification />

      <SecretGiftUnlock />
    </>
  );
}
