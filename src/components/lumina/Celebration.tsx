import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLumina } from "@/lib/lumina-store";
import { useAuth } from "@/lib/lumina-auth";
import { useSyncStatus } from "@/lib/lumina-sync";
import { detectMilestones, type Milestone } from "@/lib/lumina-greetings";

/* ------------------------------------------------------------------ *
 *  Achievement popup. Behaves like console achievements:
 *    - Fires ONCE per achievement id, per account.
 *    - Only on a real locked → unlocked transition after sync settles.
 *    - Never on login, refresh, hydration, or cloud sync catch-up.
 *
 *  Dev reset:  window.__resetAchievements()
 * ------------------------------------------------------------------ */

const KEY_PREFIX = "lumina-celebrated-v2:";
const LEGACY_KEY = "lumina-celebrated-v1";

function storageKey(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

function readUnlocked(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeUnlocked(userId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** Active account bucket — swapped when the signed-in user changes. */
let activeUserId: string | null = null;
let unlockedIds: Set<string> = new Set();
/** True after a silent seed against post-sync data for the active user. */
let hasSeeded = false;

function bindUser(userId: string) {
  if (activeUserId === userId) return;
  activeUserId = userId;
  unlockedIds = readUnlocked(userId);
  hasSeeded = false;
  // Drop legacy global key so old toast state can't leak across accounts.
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

function persistActive() {
  if (!activeUserId) return;
  writeUnlocked(activeUserId, unlockedIds);
}

if (typeof window !== "undefined") {
  (window as unknown as { __resetAchievements?: () => void }).__resetAchievements = () => {
    unlockedIds.clear();
    hasSeeded = false;
    try {
      if (activeUserId) window.localStorage.removeItem(storageKey(activeUserId));
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
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
  const userId = useAuth((s) => s.user?.id ?? null);
  const syncStatus = useSyncStatus((s) => s.status);
  const notes = useLumina((s) => s.notes);
  const journal = useLumina((s) => s.journal);
  const letters = useLumina((s) => s.letters);
  const memories = useLumina((s) => s.memories);
  const habits = useLumina((s) => s.habits);
  const capsules = useLumina((s) => s.capsules);
  const [active, setActive] = useState<Milestone | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync must settle before we judge milestones — otherwise empty local state
  // seeds, then cloud data arrives and every earned badge looks "new".
  const syncReady =
    syncStatus === "synced" ||
    syncStatus === "offline" ||
    syncStatus === "error";

  useEffect(() => {
    if (!userId || !syncReady) return;
    bindUser(userId);

    const streak = computeStreak(journal.map((j) => j.date));
    const found = detectMilestones({ notes, journal, letters, memories, streak, habits, capsules });

    // Silent catch-up: mark everything already true after sync as known.
    if (!hasSeeded) {
      hasSeeded = true;
      let dirty = false;
      for (const m of found) {
        if (!unlockedIds.has(m.id)) {
          unlockedIds.add(m.id);
          dirty = true;
        }
      }
      if (dirty) persistActive();
      return;
    }

    const fresh = found.find((m) => !unlockedIds.has(m.id));
    if (!fresh) return;
    unlockedIds.add(fresh.id);
    persistActive();
    setActive(fresh);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(null), 4600);
  }, [userId, syncReady, notes, journal, letters, memories, habits, capsules]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Clear popup when account changes / signs out.
  useEffect(() => {
    if (!userId) setActive(null);
  }, [userId]);

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
