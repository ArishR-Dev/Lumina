import { useEffect, useRef, useState } from "react";
import { Moon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth, signOutClean } from "@/lib/lumina-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function UserChip({ collapsed }: { collapsed: boolean }) {
  const { user, displayName, avatarUrl } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Reserve the chip's footprint even while auth is resolving so the
  // sidebar layout above (Farewell entry, SyncPill) doesn't shift when
  // `user` transitions from null → hydrated. A shifting sibling makes
  // the Farewell anchor "unstable" for automated clicks and momentarily
  // pushes navigation targets under the cursor.
  if (!user) return <div aria-hidden className="h-[52px]" />;
  const name = displayName || user.email?.split("@")[0] || "friend";
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-2xl border border-white/60 bg-white/50 px-2 py-2 text-left transition hover:bg-white/70 dark:border-white/10 dark:bg-white/5"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" referrerPolicy="no-referrer" crossOrigin="anonymous" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--blossom, var(--primary)) 80%, transparent))" }}>
            {initial}
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="truncate text-[10px] text-muted-foreground">{user.email}</div>
          </div>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass absolute bottom-full left-0 z-[60] mb-3 w-52 rounded-2xl border border-white/60 p-1.5 shadow-2xl dark:border-white/10"
            role="menu"
          >
            <button
              onClick={() => {
                setOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground/85 transition hover:bg-primary/10 hover:text-foreground"
              role="menuitem"
            >
              <Moon className="h-4 w-4" /> Rest for Now
            </button>
          </motion.div>
        )}
      </AnimatePresence>


      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="glass border-white/60 dark:border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">Leaving Lumina?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              Your memories, notes, and journal are safely synced.
              <br />
              You can always return whenever you're ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-white/60 bg-white/50 hover:bg-white/70 dark:border-white/10 dark:bg-white/5">
              Stay a Little
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void signOutClean()}
              className="rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] text-primary-foreground shadow-md hover:brightness-105"
            >
              🌙 Rest for Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
