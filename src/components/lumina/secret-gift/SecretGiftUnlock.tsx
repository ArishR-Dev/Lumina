import { useEffect, useMemo, useState } from "react";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Gift } from "lucide-react";

import { useSecretGift } from "@/lib/secret-gift";

import { toast } from "sonner";

type Phase = "darken" | "glow" | "break" | "open" | "reveal";

type AnimationProfile = {
  id: string;

  phases: Phase[];

  timings: number[];
};

const PROFILES: Record<string, AnimationProfile> = {
  "cinematic-unlock": {
    id: "cinematic-unlock",

    phases: ["darken", "glow", "break", "open", "reveal"],

    timings: [500, 1600, 2600, 3800],
  },

  "soft-fade": {
    id: "soft-fade",

    phases: ["darken", "reveal"],

    timings: [400, 1200],
  },

  "simple-pop": {
    id: "simple-pop",

    phases: ["darken", "open", "reveal"],

    timings: [300, 900],
  },
};

function resolveProfile(key: string | undefined): AnimationProfile {
  return PROFILES[key ?? ""] ?? PROFILES["cinematic-unlock"];
}

export function SecretGiftUnlock() {
  const open = useSecretGift((s) => s.unlockOpen);

  const config = useSecretGift((s) => s.config);

  const progress = useSecretGift((s) => s.progress);

  const setUnlockOpen = useSecretGift((s) => s.setUnlockOpen);

  const markOpened = useSecretGift((s) => s.markOpened);

  const reduce = useReducedMotion();

  const profile = useMemo(() => resolveProfile(config?.animation_key), [config?.animation_key]);

  const [phase, setPhase] = useState<Phase>("darken");

  const [saving, setSaving] = useState(false);

  const alreadyOpened = !!progress?.gift_opened_at;

  const oneTime = config?.one_time !== false;

  useEffect(() => {
    if (!open) {
      setPhase("darken");

      return;
    }

    if (reduce) {
      setPhase("reveal");

      return;
    }

    const timers = profile.timings.map((ms, i) =>
      window.setTimeout(() => setPhase(profile.phases[i + 1] ?? "reveal"), ms),
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [open, reduce, profile]);

  const finish = async () => {
    if (alreadyOpened && oneTime) {
      setUnlockOpen(false);

      return;
    }

    setSaving(true);

    try {
      if (!alreadyOpened) {
        await markOpened();
      }

      toast.success("Gift opened", { description: "A quiet treasure, just for you." });

      setUnlockOpen(false);
    } catch (e) {
      console.error(e);

      toast.error("Couldn't save gift state");

      setUnlockOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const showGiftIcon = phase !== "reveal";

  const showBloom = profile.id === "cinematic-unlock" && (phase === "break" || phase === "open");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}

          animate={{ opacity: 1 }}

          exit={{ opacity: 0 }}

          className="fixed inset-0 z-[95] overflow-y-auto overflow-x-hidden bg-[oklch(0.08_0.04_290)] dark:bg-[oklch(0.08_0.04_290)]"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}

          role="dialog"

          aria-modal="true"

          aria-label="Opening secret gift"
        >
          <div aria-hidden className="absolute inset-0">
            {Array.from({ length: phase === "darken" ? 18 : 48 }).map((_, i) => (
              <motion.span
                key={i}

                className="absolute rounded-full"

                style={{
                  left: `${(i * 17) % 100}%`,

                  top: `${(i * 29) % 100}%`,

                  width: 2 + (i % 3),

                  height: 2 + (i % 3),

                  background: "oklch(0.92 0.14 85 / 0.85)",

                  boxShadow: "0 0 10px oklch(0.9 0.16 85 / 0.7)",
                }}

                animate={{
                  y: [0, -40 - (i % 20), -80],

                  opacity: [0, 0.9, 0],
                }}

                transition={{ duration: 2.4 + (i % 5) * 0.2, repeat: Infinity, delay: i * 0.05 }}
              />
            ))}
          </div>

          <div className="relative z-10 grid min-h-[100dvh] place-items-center px-6">
            {showGiftIcon && (
              <motion.div
                key={phase}

                animate={
                  phase === "glow"
                    ? {
                        scale: [1, 1.06, 1],
                        filter: ["brightness(1)", "brightness(1.4)", "brightness(1.2)"],
                      }
                    : phase === "break"
                      ? { scale: [1, 1.2, 0], opacity: [1, 1, 0], rotate: [0, 8, -12] }
                      : phase === "open"
                        ? { scale: [0.6, 1.1, 1], opacity: [0, 1, 1] }
                        : profile.id === "simple-pop"
                          ? { scale: [0.85, 1.08, 1] }
                          : { scale: 1, opacity: profile.id === "soft-fade" ? [0.6, 1] : 1 }
                }

                transition={{ duration: profile.id === "simple-pop" ? 0.5 : 0.9 }}

                className="grid h-28 w-28 place-items-center rounded-[2rem] bg-gradient-to-br from-[oklch(0.88_0.16_85)] to-[oklch(0.65_0.18_50)] text-[oklch(0.18_0.04_60)] shadow-[0_0_80px_oklch(0.85_0.18_85_/0.65)]"
              >
                <Gift className="h-12 w-12" />
              </motion.div>
            )}

            {phase === "reveal" && (
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.96 }}

                animate={{ opacity: 1, y: 0, scale: 1 }}

                transition={{ duration: profile.id === "soft-fade" ? 0.6 : 0.4 }}

                className="w-full max-w-lg max-h-[min(85dvh,640px)] overflow-y-auto rounded-[1.75rem] border border-[oklch(0.85_0.14_85_/0.4)] bg-[oklch(0.14_0.04_290_/0.92)] p-5 text-center text-white shadow-2xl backdrop-blur-xl sm:p-7"
              >
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[oklch(0.88_0.16_85)] to-[oklch(0.72_0.18_50)] text-[oklch(0.18_0.04_60)]">
                  <Gift className="h-8 w-8" />
                </div>

                <div className="mt-4 text-[10px] uppercase tracking-[0.28em] text-[oklch(0.9_0.1_85)]/80">
                  unlocked
                </div>

                <h2 className="mt-2 font-display text-3xl">
                  {config?.gift_title ?? "Your Secret Gift"}
                </h2>

                <p className="mt-3 text-sm leading-relaxed text-white/75">
                  {config?.custom_message || config?.gift_description}
                </p>

                {!!config?.image_urls?.length && (
                  <div className="mt-5 grid gap-2">
                    {config.image_urls.slice(0, 3).map((src) => (
                      <img
                        key={src}

                        src={src}

                        alt=""

                        className="mx-auto max-h-48 w-full rounded-2xl object-cover"
                      />
                    ))}
                  </div>
                )}

                {!!config?.video_urls?.[0] && (
                  <video
                    src={config.video_urls[0]}

                    controls

                    className="mt-4 w-full rounded-2xl"
                  />
                )}

                {!!config?.audio_urls?.[0] && (
                  <audio src={config.audio_urls[0]} controls className="mt-4 w-full" />
                )}

                <button
                  type="button"

                  disabled={saving}

                  onClick={() => void finish()}

                  className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-[oklch(0.82_0.16_85)] to-[oklch(0.72_0.18_50)] px-6 text-sm font-medium text-[oklch(0.18_0.04_60)] disabled:opacity-60"
                >
                  {saving ? "Saving…" : alreadyOpened && !oneTime ? "Close" : "Receive with love"}
                </button>
              </motion.div>
            )}
          </div>

          {showBloom && (
            <motion.div
              aria-hidden

              initial={{ opacity: 0, scale: 0.4 }}

              animate={{ opacity: [0, 0.9, 0], scale: [0.4, 2.2, 3] }}

              transition={{ duration: 1.2 }}

              className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full"

              style={{
                background:
                  "radial-gradient(closest-side, oklch(0.95 0.12 85 / 0.95), oklch(0.8 0.16 60 / 0.35), transparent)",
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
