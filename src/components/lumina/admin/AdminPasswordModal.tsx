import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff, Lock, Loader2 } from "lucide-react";
import { useAdminAccess } from "@/lib/admin-access";
import { cn } from "@/lib/utils";

export function AdminPasswordModal() {
  const open = useAdminAccess((s) => s.modalOpen);
  const setModalOpen = useAdminAccess((s) => s.setModalOpen);
  const verifyPassword = useAdminAccess((s) => s.verifyPassword);
  const reduce = useReducedMotion();

  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setShow(false);
      setLoading(false);
      setInvalid(false);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [open]);

  const submit = async () => {
    if (loading || !password.trim()) return;
    setLoading(true);
    setInvalid(false);
    const ok = await verifyPassword(password);
    setLoading(false);
    if (!ok) {
      setInvalid(true);
      setPassword("");
      inputRef.current?.focus();
    }
  };

  const close = () => {
    if (loading) return;
    setModalOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-4 backdrop-blur-md sm:items-center"
          onClick={close}
          role="presentation"
        >
          <motion.div
            initial={{ y: reduce ? 0 : 28, opacity: 0, scale: 0.97 }}
            animate={{
              y: 0,
              opacity: 1,
              scale: 1,
              x: invalid && !reduce ? [0, -8, 8, -6, 6, 0] : 0,
            }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={{
              type: "spring",
              stiffness: 280,
              damping: 26,
              x: invalid ? { duration: 0.45 } : undefined,
            }}
            onClick={(e) => e.stopPropagation()}
            className="glass relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/50 p-6 shadow-2xl dark:border-white/10"
            role="dialog"
            aria-modal="true"
            aria-label="Access verification"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -left-20 -top-20 h-48 w-48 rounded-full opacity-40 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in oklab, var(--primary) 55%, transparent), transparent 70%)",
              }}
            />

            <div className="relative z-10">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-[color-mix(in_oklab,var(--primary)_40%,var(--accent))] text-primary shadow-inner">
                <Lock className="h-6 w-6" />
              </div>

              <h2 className="mt-4 text-center font-display text-2xl">Verify Access</h2>
              <p className="mt-1.5 text-center text-sm text-muted-foreground">
                Enter your access password to continue.
              </p>

              <form
                className="mt-6 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <div className="relative">
                  <input
                    ref={inputRef}
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setInvalid(false);
                    }}
                    autoComplete="current-password"
                    disabled={loading}
                    placeholder="Access password"
                    aria-invalid={invalid}
                    className={cn(
                      "w-full rounded-2xl border bg-white/60 py-3 pl-4 pr-12 text-sm outline-none transition",
                      "focus:border-primary/50 focus:ring-2 focus:ring-primary/20",
                      "dark:border-white/10 dark:bg-white/5",
                      invalid && "border-destructive/50 shake-border",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground hover:bg-white/50 dark:hover:bg-white/10"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {invalid && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center text-xs text-muted-foreground"
                  >
                    Invalid access.
                  </motion.p>
                )}

                <button
                  type="submit"
                  disabled={loading || !password.trim()}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:brightness-105 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={close}
                  className="min-h-10 w-full rounded-full text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
