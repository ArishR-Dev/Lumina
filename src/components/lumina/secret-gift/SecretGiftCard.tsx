import { motion, useReducedMotion } from "framer-motion";
import { Lock, Gift, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SecretGiftConfig, SecretGiftProgress } from "@/lib/secret-gift";

type Props = {
  config: SecretGiftConfig;
  progress: SecretGiftProgress | null;
  onOpenGift?: () => void;
};

export function SecretGiftCard({ config, progress, onOpenGift }: Props) {
  const reduce = useReducedMotion();
  const count = progress?.login_day_count ?? 0;
  const goal = config.required_login_days || 90;
  const pct = Math.min(1, count / goal);
  const remaining = Math.max(0, goal - count);
  const unlocked = !!progress?.gift_unlocked_at || count >= goal;
  const opened = !!progress?.gift_opened_at;
  const readyUnopened = unlocked && !opened;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative col-span-1 sm:col-span-2 lg:col-span-3"
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[1.75rem] border p-5 sm:p-7",
          "bg-gradient-to-br from-[oklch(0.22_0.06_290_/0.55)] via-[oklch(0.18_0.05_280_/0.45)] to-[oklch(0.28_0.08_50_/0.35)]",
          "border-[oklch(0.85_0.14_85_/0.35)] shadow-[0_24px_80px_-28px_oklch(0.65_0.18_80_/0.55)]",
          "backdrop-blur-xl dark:from-[oklch(0.18_0.05_290_/0.75)]",
        )}
      >
        {/* Ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full opacity-50 blur-3xl"
          style={{
            background: "radial-gradient(circle, oklch(0.85 0.16 85 / 0.45), transparent 70%)",
            animation: reduce ? undefined : "secret-gift-breathe 5.5s ease-in-out infinite",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-10 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{
            background: "radial-gradient(circle, oklch(0.7 0.2 320 / 0.4), transparent 70%)",
            animation: reduce ? undefined : "secret-gift-breathe 7s ease-in-out infinite reverse",
          }}
        />

        {!reduce && <FloatingSparkles />}

        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <div className="relative mx-auto grid h-28 w-28 shrink-0 place-items-center sm:mx-0">
            <div
              className={cn(
                "absolute inset-0 rounded-[2rem] opacity-80",
                unlocked
                  ? "bg-gradient-to-br from-[oklch(0.88_0.16_85)] to-[oklch(0.72_0.18_50)]"
                  : "bg-gradient-to-br from-[oklch(0.55_0.08_290)] to-[oklch(0.35_0.08_280)]",
              )}
              style={{
                boxShadow: unlocked
                  ? "0 0 40px oklch(0.85 0.18 85 / 0.55)"
                  : "0 0 28px oklch(0.7 0.14 85 / 0.25)",
                animation: reduce ? undefined : "secret-gift-breathe 4s ease-in-out infinite",
              }}
            />
            <div className="relative grid h-[5.5rem] w-[5.5rem] place-items-center rounded-[1.65rem] bg-[oklch(0.14_0.04_290_/0.85)] text-[oklch(0.92_0.12_85)] ring-1 ring-[oklch(0.9_0.12_85_/0.35)]">
              {opened ? (
                <Gift className="h-10 w-10" />
              ) : unlocked ? (
                <Gift className="h-10 w-10 animate-pulse" />
              ) : (
                <Lock
                  className="h-9 w-9"
                  style={{
                    filter: "drop-shadow(0 0 8px oklch(0.85 0.16 85 / 0.8))",
                    animation: reduce ? undefined : "secret-gift-lock 2.8s ease-in-out infinite",
                  }}
                />
              )}
            </div>
            {readyUnopened && (
              <span className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-[oklch(0.82_0.16_85)] text-sm shadow-lg">
                ✨
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.85_0.14_85_/0.35)] bg-black/20 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[oklch(0.92_0.1_85)]">
              <Sparkles className="h-3 w-3" /> Secret Gift
            </div>
            <h2 className="mt-2 font-display text-2xl text-white sm:text-3xl">
              {opened ? config.gift_title : "Secret Gift"}
            </h2>
            <p className="mt-1.5 text-sm text-white/70">
              {opened
                ? config.gift_description
                : unlocked
                  ? "Your surprise is ready — open it when you like."
                  : "Keep coming back... Your surprise is getting closer."}
            </p>

            {!opened && (
              <div className="mt-5">
                <div className="mb-2 flex items-end justify-between gap-3 text-xs uppercase tracking-[0.18em] text-white/55">
                  <span>Login Days</span>
                  <span className="tabular-nums text-white/85">
                    {count} / {goal}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
                  <motion.div
                    initial={false}
                    animate={{ width: `${pct * 100}%` }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-[oklch(0.78_0.16_85)] via-[oklch(0.85_0.14_70)] to-[oklch(0.75_0.18_320)]"
                    style={{ boxShadow: "0 0 16px oklch(0.85 0.16 85 / 0.55)" }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/60">
                  <span>{Math.round(pct * 100)}% complete</span>
                  <span>
                    {remaining === 0
                      ? "Ready to open"
                      : `${remaining} Login Day${remaining === 1 ? "" : "s"} Remaining`}
                  </span>
                </div>
              </div>
            )}

            {readyUnopened && (
              <button
                type="button"
                onClick={onOpenGift}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.82_0.16_85)] to-[oklch(0.72_0.18_50)] px-5 text-sm font-medium text-[oklch(0.18_0.04_60)] shadow-lg transition hover:brightness-110 active:scale-[0.98]"
              >
                <Gift className="h-4 w-4" /> Open Gift
              </button>
            )}
            {opened && config.one_time === false && (
              <button
                type="button"
                onClick={onOpenGift}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[oklch(0.85_0.14_85_/0.45)] bg-white/10 px-5 text-sm font-medium text-white transition hover:bg-white/15 active:scale-[0.98]"
              >
                <Gift className="h-4 w-4" /> View Gift Again
              </button>
            )}
          </div>

          {/* Circular progress — visible from small screens up */}
          {!opened && (
            <div className="relative mx-auto h-20 w-20 shrink-0 sm:mx-0 sm:h-24 sm:w-24">
              <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  stroke="oklch(1 0 0 / 0.1)"
                  strokeWidth="6"
                />
                <motion.circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  stroke="url(#secret-gift-ring)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 40}
                  initial={false}
                  animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - pct) }}
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                />
                <defs>
                  <linearGradient id="secret-gift-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="oklch(0.88 0.16 85)" />
                    <stop offset="100%" stopColor="oklch(0.72 0.2 320)" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div className="rotate-0 text-sm font-semibold tabular-nums text-white">
                  {Math.round(pct * 100)}%
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes secret-gift-breathe {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes secret-gift-lock {
          0%, 100% { transform: translateY(0); filter: drop-shadow(0 0 6px oklch(0.85 0.16 85 / 0.6)); }
          50% { transform: translateY(-2px); filter: drop-shadow(0 0 14px oklch(0.9 0.18 85 / 0.95)); }
        }
      `}</style>
    </motion.div>
  );
}

function FloatingSparkles() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="absolute block h-1 w-1 rounded-full bg-[oklch(0.95_0.1_85)]"
          style={{
            left: `${8 + ((i * 17) % 84)}%`,
            top: `${12 + ((i * 23) % 70)}%`,
            opacity: 0.35 + (i % 4) * 0.12,
            animation: `secret-gift-sparkle ${3 + (i % 5)}s ease-in-out ${i * 0.2}s infinite`,
            boxShadow: "0 0 8px oklch(0.9 0.14 85 / 0.8)",
          }}
        />
      ))}
      <style>{`
        @keyframes secret-gift-sparkle {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.25; }
          50% { transform: translateY(-10px) scale(1.4); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
