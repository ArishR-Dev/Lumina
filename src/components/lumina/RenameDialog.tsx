import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Lumina Rename Dialog — premium, iOS-quality modal.
 *
 * - Centered, glass, mobile-first
 * - Autofocus + select-all on open
 * - Enter → save; Escape → cancel
 * - Focus trap; safe-area padded; visualViewport-aware
 * - 44px+ touch targets everywhere
 */
type Props = {
  open: boolean;
  title?: string;
  description?: string;
  initialValue: string;
  placeholder?: string;
  onCancel: () => void;
  onSave: (name: string) => void;
};

export function RenameDialog({
  open,
  title = "Rename Memory",
  description = "Give this memory a meaningful name.",
  initialValue,
  placeholder = "Enter memory name...",
  onCancel,
  onSave,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [kbOffset, setKbOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const descId = useId();

  // Reset value + focus/select on open
  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [open, initialValue]);

  // Escape to close + focus trap
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Tab" && formRef.current) {
        const focusables = formRef.current.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // Body scroll lock while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Track keyboard: shift modal up so buttons stay visible on iOS/Android
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(kb > 80 ? kb / 2 : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setKbOffset(0);
    };
  }, [open]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0;
  const commit = () => {
    if (!canSave) return;
    onSave(trimmed);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
            paddingRight: "max(1.25rem, env(safe-area-inset-right))",
          }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close dialog"
            tabIndex={-1}
            onClick={onCancel}
            className="absolute inset-0 bg-black/65 backdrop-blur-md"
          />

          <motion.form
            ref={formRef}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: -kbOffset, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
            className="relative z-10 w-full rounded-[24px] border border-white/10 bg-black/70 p-6 text-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
            style={{ maxWidth: "min(90vw, 420px)" }}
          >
            <h2
              id={titleId}
              className="text-[22px] font-semibold leading-tight tracking-tight text-white"
            >
              {title}
            </h2>
            <p id={descId} className="mt-1.5 text-sm leading-relaxed text-white/60">
              {description}
            </p>

            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              maxLength={200}
              aria-label={title}
              className="mt-6 h-14 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-base text-white placeholder:text-white/40 outline-none transition focus:border-white/20 focus:bg-white/[0.09] focus:ring-2 focus:ring-white/15"
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="h-12 rounded-2xl border border-white/15 bg-white/[0.04] text-[15px] font-medium text-white transition hover:bg-white/[0.08] active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="h-12 rounded-2xl bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] text-[15px] font-semibold text-white shadow-none transition hover:shadow-[0_10px_30px_-10px_color-mix(in_oklab,var(--primary)_60%,transparent)] focus-visible:shadow-[0_10px_30px_-10px_color-mix(in_oklab,var(--primary)_60%,transparent)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
              >
                Save
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
