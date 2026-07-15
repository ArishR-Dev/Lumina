import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLumina } from "@/lib/lumina-store";
import { detectMilestones, type Milestone } from "@/lib/lumina-greetings";

/* ------------------------------------------------------------------ *
 *  Achievement popup. Behaves like console achievements:
 *    - Fires ONCE per achievement id, ever.
 *    - Only on a real locked → unlocked transition.
 *    - Never on refresh, hydration, sync, navigation, or StrictMode
 *      double-effects.
 *
 *  Unlocked ids are persisted in localStorage under a dedicated key
 *  (independent of the Zustand store, so Supabase sync overwriting the
 *  store cannot "forget" them). A module-scoped Set mirrors the same
 *  data so StrictMode's second effect invocation sees the write from
 *  the first one synchronously — no race window.
 *
 *  Dev reset:  window.__resetAchievements()
 * ------------------------------------------------------------------ */

const KEY = "lumina-celebrated-v1";

function readUnlockedFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

// Module-scoped mirror. Survives StrictMode remount and component
// remount on route change; the only way to clear it is the dev reset.
const unlockedIds: Set<string> = readUnlockedFromStorage();
// Tracks whether we've done the "seed on first mount" pass — used to
// suppress the popup for milestones already true at hydration time
// (they aren't real transitions, just state we're catching up to).
let hasSeeded = false;

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...unlockedIds]));
  } catch {}
}

if (typeof window !== "undefined") {
  (window as unknown as { __resetAchievements?: () => void }).__resetAchievements = () => {
    unlockedIds.clear();
    hasSeeded = false;
    try {
      window.localStorage.removeItem(KEY);
    } catch {}
    // eslint-disable-next-line no-console
    console.info("[achievements] reset");
  };
}

function computeStreak(dates: string[]) {
  const set = new Set(dates);
  let streak = 0;
  const d = new Date();
  while (set.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function Celebration() {
  const notes = useLumina((s) => s.notes);
  const journal = useLumina((s) => s.journal);
  const letters = useLumina((s) => s.letters);
  const memories = useLumina((s) => s.memories);
  const habits = useLumina((s) => s.habits);
  const capsules = useLumina((s) => s.capsules);
  const [active, setActive] = useState<Milestone | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const streak = computeStreak(journal.map((j) => j.date));
    const found = detectMilestones({ notes, journal, letters, memories, streak, habits, capsules });

    // Seed pass: on first ever run in this session, silently mark any
    // currently-true milestones as unlocked without firing the popup.
    // This handles hydration / sync / refresh — no transition occurred.
    if (!hasSeeded) {
      hasSeeded = true;
      let dirty = false;
      for (const m of found) {
        if (!unlockedIds.has(m.id)) {
          unlockedIds.add(m.id);
          dirty = true;
        }
      }
      if (dirty) persist();
      return;
    }

    // Post-seed: only fire for a genuine locked → unlocked transition.
    const fresh = found.find((m) => !unlockedIds.has(m.id));
    if (!fresh) return;
    unlockedIds.add(fresh.id);
    persist();
    setActive(fresh);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(null), 4600);
  }, [notes, journal, letters, memories, habits, capsules]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {active && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[80]"
          >
            <Confetti />
          </motion.div>
          <motion.div
            key="card"
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="pointer-events-none fixed left-1/2 top-8 z-[90] -translate-x-1/2"
          >
            <div className="glass rounded-3xl px-6 py-4 text-center shadow-xl">
              <div className="text-3xl">{active.emoji}</div>
              <div className="mt-1 font-display text-lg">{active.label}</div>
              <div className="text-xs text-muted-foreground">a little milestone — well done</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 40 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.6;
        const dur = 2.4 + Math.random() * 1.6;
        const hue = 320 + Math.random() * 60;
        const size = 6 + Math.random() * 6;
        return (
          <motion.span
            key={i}
            initial={{ y: -20, x: 0, opacity: 0, rotate: 0 }}
            animate={{ y: "110vh", opacity: [0, 1, 1, 0], rotate: 360 }}
            transition={{ duration: dur, delay, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: 0,
              left: `${left}%`,
              width: size,
              height: size * 0.6,
              borderRadius: 2,
              background: `oklch(0.82 0.13 ${hue})`,
            }}
          />
        );
      })}
    </div>
  );
}
