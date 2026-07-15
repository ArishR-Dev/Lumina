import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getDialogSnapshot,
  luminaDialog,
  subscribeDialogs,
  type DialogRecord,
  type DialogTone,
} from "@/lib/lumina-dialog";

/**
 * Global dialog host. Mount once near the app root; every call to
 * `luminaDialog.*` renders through this component.
 */
export function LuminaDialogHost() {
  const state = useSyncExternalStore(subscribeDialogs, getDialogSnapshot, getDialogSnapshot);
  return (
    <AnimatePresence>
      {state.queue.map((d, i) => (
        <DialogView key={d.id} record={d} index={i} total={state.queue.length} />
      ))}
    </AnimatePresence>
  );
}

const TONE: Record<
  DialogTone,
  {
    ring: string;
    iconBg: string;
    iconColor: string;
    glow: string;
    confirmBg: string;
    confirmShadow: string;
    focus: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  danger: {
    ring: "ring-red-400/40",
    iconBg: "bg-red-500/15",
    iconColor: "text-red-300",
    glow: "radial-gradient(closest-side, oklch(0.68 0.22 25 / 0.35), transparent 70%)",
    confirmBg: "bg-gradient-to-r from-red-500 via-rose-500 to-red-600",
    confirmShadow: "shadow-[0_10px_30px_-10px_rgba(239,68,68,0.6)]",
    focus: "focus-visible:ring-red-300/60",
    Icon: Trash2,
  },
  warning: {
    ring: "ring-amber-400/40",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-200",
    glow: "radial-gradient(closest-side, oklch(0.78 0.18 80 / 0.35), transparent 70%)",
    confirmBg: "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600",
    confirmShadow: "shadow-[0_10px_30px_-10px_rgba(245,158,11,0.55)]",
    focus: "focus-visible:ring-amber-300/60",
    Icon: AlertTriangle,
  },
  success: {
    ring: "ring-emerald-400/40",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-300",
    glow: "radial-gradient(closest-side, oklch(0.75 0.17 155 / 0.35), transparent 70%)",
    confirmBg: "bg-gradient-to-r from-emerald-500 to-emerald-600",
    confirmShadow: "shadow-[0_10px_30px_-10px_rgba(16,185,129,0.55)]",
    focus: "focus-visible:ring-emerald-300/60",
    Icon: CheckCircle2,
  },
  error: {
    ring: "ring-red-400/40",
    iconBg: "bg-red-500/15",
    iconColor: "text-red-300",
    glow: "radial-gradient(closest-side, oklch(0.65 0.22 20 / 0.35), transparent 70%)",
    confirmBg: "bg-gradient-to-r from-red-500 to-rose-600",
    confirmShadow: "shadow-[0_10px_30px_-10px_rgba(239,68,68,0.55)]",
    focus: "focus-visible:ring-red-300/60",
    Icon: XCircle,
  },
  info: {
    ring: "ring-sky-400/40",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-300",
    glow: "radial-gradient(closest-side, oklch(0.7 0.14 240 / 0.35), transparent 70%)",
    confirmBg: "bg-gradient-to-r from-sky-500 to-blue-600",
    confirmShadow: "shadow-[0_10px_30px_-10px_rgba(59,130,246,0.55)]",
    focus: "focus-visible:ring-sky-300/60",
    Icon: Info,
  },
  neutral: {
    ring: "ring-white/25",
    iconBg: "bg-white/10",
    iconColor: "text-white/85",
    glow: "radial-gradient(closest-side, oklch(0.7 0.14 300 / 0.28), transparent 70%)",
    confirmBg: "bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))]",
    confirmShadow: "shadow-[0_10px_30px_-10px_rgba(120,80,220,0.55)]",
    focus: "focus-visible:ring-white/50",
    Icon: ShieldAlert,
  },
};

function DialogView({
  record,
  index,
  total,
}: {
  record: DialogRecord;
  index: number;
  total: number;
}) {
  const t = TONE[record.tone];
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isTop = index === total - 1;

  useEffect(() => {
    if (!isTop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "loading" && record.dismissible !== false) {
        e.preventDefault();
        luminaDialog.close(record.id, false);
      }
      if (e.key === "Tab") {
        const a = cancelRef.current;
        const b = confirmRef.current;
        if (!a && !b) return;
        e.preventDefault();
        const active = document.activeElement;
        if (a && b) (active === b ? a : b).focus();
        else (b ?? a)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const t0 = setTimeout(() => {
      (record.showCancel ? cancelRef.current : confirmRef.current)?.focus();
    }, 60);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t0); };
  }, [isTop, record, status]);

  const handleConfirm = async () => {
    if (status === "loading") return;
    if (!record.onConfirm) {
      luminaDialog.close(record.id, true);
      return;
    }
    setStatus("loading");
    try {
      await record.onConfirm();
      luminaDialog.close(record.id, true);
    } catch {
      setStatus("idle");
    }
  };

  const handleCancel = () => {
    if (status === "loading") return;
    luminaDialog.close(record.id, false);
  };

  const IconEl = t.Icon;

  return (
    <motion.div
      key={record.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(e) => {
        if (!isTop) return;
        if (status === "loading") return;
        if (record.dismissible === false) return;
        if (e.target === e.currentTarget) handleCancel();
      }}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-md"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${record.id}-title`}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 4 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className={cn(
          "relative w-full max-w-md overflow-y-auto overflow-x-hidden rounded-[22px] p-6 sm:p-7",
          "max-h-[95dvh]",
          "border border-white/15 bg-white/10 text-white backdrop-blur-2xl",
          "shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset]",
        )}
      >
        {/* ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
          style={{ background: t.glow }}
        />

        {/* Icon */}
        <div className="relative mx-auto mb-4 grid h-14 w-14 place-items-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            className={cn("grid h-14 w-14 place-items-center rounded-full ring-1", t.iconBg, t.iconColor, t.ring)}
          >
            {record.icon ?? <IconEl className="h-6 w-6" />}
          </motion.div>
        </div>

        {/* Title */}
        <h2 id={`${record.id}-title`} className="text-center font-serif text-[22px] leading-tight text-white">
          {record.title}
        </h2>

        {/* Description */}
        {record.description && (
          <div className="mt-2 text-center text-[13.5px] leading-relaxed text-white/70">
            {record.description}
          </div>
        )}

        {/* Custom body */}
        {record.body && <div className="mt-4">{record.body}</div>}

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          {record.showCancel !== false && (
            <button
              ref={cancelRef}
              type="button"
              onClick={handleCancel}
              disabled={status === "loading"}
              className={cn(
                "flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white/90",
                "transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                "disabled:opacity-50",
              )}
            >
              {record.cancelLabel ?? "Cancel"}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={status === "loading"}
            className={cn(
              "group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-3 text-sm font-semibold text-white",
              t.confirmBg,
              t.confirmShadow,
              "transition focus:outline-none focus-visible:ring-2",
              t.focus,
              "disabled:cursor-not-allowed disabled:opacity-90",
              "hover:brightness-110 active:scale-[0.98]",
            )}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100"
              style={{ background: "radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.35), transparent 60%)" }}
            />
            {status === "loading" ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                <span>Working…</span>
              </>
            ) : (
              <span>{record.confirmLabel ?? "Confirm"}</span>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

