import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getLoadingSnapshot,
  subscribeLoading,
  type LoadingRecord,
} from "@/lib/lumina-dialog";

/**
 * Global loading overlay. Renders whenever `luminaDialog.showLoading(...)` is
 * active. Supports optional determinate progress (0..1) and skeleton rows.
 */
export function LuminaLoadingOverlay() {
  const state = useSyncExternalStore(subscribeLoading, getLoadingSnapshot, getLoadingSnapshot);
  const top = state.stack[state.stack.length - 1];
  return (
    <AnimatePresence>{top && <LoadingView key={top.id} record={top} />}</AnimatePresence>
  );
}

function LoadingView({ record }: { record: LoadingRecord }) {
  const hasProgress = typeof record.progress === "number";
  const pct = hasProgress ? Math.max(0, Math.min(1, record.progress ?? 0)) : 0;
  const skeletonRows = record.skeleton
    ? typeof record.skeleton === "number"
      ? record.skeleton
      : 3
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-md"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      role="alertdialog"
      aria-modal="true"
      aria-live="polite"
      aria-busy="true"
      aria-labelledby={`${record.id}-title`}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 6 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className={cn(
          "relative w-full max-w-sm overflow-hidden rounded-[22px] p-6 sm:p-7",
          "border border-white/15 bg-white/10 text-white backdrop-blur-2xl",
          "shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset]",
        )}
      >
        {/* ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.7 0.16 300 / 0.35), transparent 70%)",
          }}
        />

        {/* Spinner */}
        <div className="relative mx-auto mb-4 grid h-14 w-14 place-items-center">
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full ring-1 ring-white/15"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, ease: "linear", repeat: Infinity }}
          />
          <div className="grid h-14 w-14 place-items-center rounded-full bg-white/10 ring-1 ring-white/20">
            <Loader2 className="h-6 w-6 animate-spin text-white/85" />
          </div>
        </div>

        {/* Title */}
        <h2
          id={`${record.id}-title`}
          className="text-center font-serif text-[20px] leading-tight text-white"
        >
          {record.title ?? "Working…"}
        </h2>

        {/* Description */}
        {record.description && (
          <div className="mt-2 text-center text-[13px] leading-relaxed text-white/70">
            {record.description}
          </div>
        )}

        {/* Progress bar */}
        {hasProgress && (
          <div className="mt-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary via-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] to-accent"
                initial={false}
                animate={{ width: `${pct * 100}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 24 }}
              />
            </div>
            <div className="mt-2 text-right text-[11px] tabular-nums text-white/55">
              {Math.round(pct * 100)}%
            </div>
          </div>
        )}

        {/* Indeterminate shimmer bar when no progress */}
        {!hasProgress && !skeletonRows && (
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/60 to-transparent"
              initial={{ x: "-100%" }}
              animate={{ x: "300%" }}
              transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
            />
          </div>
        )}

        {/* Skeleton rows */}
        {skeletonRows > 0 && (
          <div className="mt-5 space-y-2">
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5"
                style={{ height: 14 + (i % 2 === 0 ? 4 : 0) }}
              >
                <motion.div
                  className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                  initial={{ x: "-100%" }}
                  animate={{ x: "300%" }}
                  transition={{
                    duration: 1.6,
                    ease: "easeInOut",
                    repeat: Infinity,
                    delay: i * 0.15,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
