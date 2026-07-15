import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Gift, X } from "lucide-react";
import { useSecretGift } from "@/lib/secret-gift";

export function SecretGiftNotification() {
  const open = useSecretGift((s) => s.notifyOpen);
  const config = useSecretGift((s) => s.config);
  const setNotifyOpen = useSecretGift((s) => s.setNotifyOpen);
  const setUnlockOpen = useSecretGift((s) => s.setUnlockOpen);
  const markNotificationSeen = useSecretGift((s) => s.markNotificationSeen);
  const reduce = useReducedMotion();

  const later = async () => {
    await markNotificationSeen();
    setNotifyOpen(false);
  };

  const openGift = async () => {
    setNotifyOpen(false);
    setUnlockOpen(true);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Secret gift ready"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
            className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-[oklch(0.85_0.14_85_/0.35)] bg-[oklch(0.16_0.04_290)] p-6 text-white shadow-2xl"
          >
            <button
              type="button"
              onClick={() => void later()}
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/15"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[oklch(0.88_0.16_85)] to-[oklch(0.72_0.18_50)] text-[oklch(0.18_0.04_60)] shadow-lg"
              style={{
                animation: reduce ? undefined : "secret-gift-breathe 3s ease-in-out infinite",
              }}
            >
              <Gift className="h-8 w-8" />
            </div>

            <h2 className="mt-4 text-center font-display text-2xl">Your Secret Gift Is Ready!</h2>
            <p className="mt-2 text-center text-sm text-white/70">
              Congratulations! You've reached {config?.required_login_days ?? 90} Login Days. Your
              surprise gift has finally been unlocked.
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => void openGift()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.82_0.16_85)] to-[oklch(0.72_0.18_50)] px-5 text-sm font-medium text-[oklch(0.18_0.04_60)]"
              >
                <Gift className="h-4 w-4" /> Open Gift
              </button>
              <button
                type="button"
                onClick={() => void later()}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 text-sm text-white/80 hover:bg-white/10"
              >
                Later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
