import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, HeartHandshake, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { MoodPicker } from "@/components/lumina/MoodPicker";
import { MoodBadge } from "@/components/lumina/MoodBadge";


import { useLumina } from "@/lib/lumina-store";
import { BUILTIN_MOODS, resolveMood } from "@/lib/lumina-moods";
import { buildGreeting, whisperForToday, onThisDay, buildInsights, daysSinceLastWrite } from "@/lib/lumina-greetings";
import { unlockAlbum, isAlbumUnlocked, setUnlockCinematicPlaying } from "@/lib/private-album/session";
import { UnlockCinematic } from "@/components/lumina/private/UnlockCinematic";



export const Route = createFileRoute("/app/home")({ component: Home });

// Secret trigger: 5 consecutive taps on the FIRST mood emoji within 3s
// reveals the hidden Private Album. Tapping any other emoji, or a pause
// longer than 3s, resets the counter.
const SECRET_MOOD_ID = BUILTIN_MOODS[0].id;
const SECRET_TAPS = 5;
const SECRET_WINDOW_MS = 3000;

// Module-level so React StrictMode remounts can't cancel vault entry.
let unlockNavTimer: number | null = null;

function Home() {
  const name = useLumina((s) => s.name);
  const notes = useLumina((s) => s.notes);
  const journal = useLumina((s) => s.journal);
  const thoughts = useLumina((s) => s.thoughts);
  const moods = useLumina((s) => s.moods);
  const customMoods = useLumina((s) => s.customMoods);
  const letters = useLumina((s) => s.letters);
  const memories = useLumina((s) => s.memories);
  const logMood = useLumina((s) => s.logMood);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const streak = computeStreak(journal.map((j) => j.date));
  const whisper = useMemo(() => whisperForToday(now), [now]);
  const dayMs = 86_400_000;
  const recentActivityCount = notes.filter((n) => now.getTime() - n.updatedAt <= dayMs).length
    + thoughts.filter((t) => now.getTime() - t.createdAt <= dayMs).length
    + (journal.some((j) => j.date === now.toISOString().slice(0, 10)) ? 1 : 0);
  const lastWroteDaysAgo = daysSinceLastWrite(now, { notes, journal, thoughts });
  const greeting = useMemo(
    () => buildGreeting({ name, now, streak, recentActivityCount, lastWroteDaysAgo }),
    [name, now, streak, recentActivityCount, lastWroteDaysAgo],
  );
  const otd = useMemo(() => onThisDay(now, { journal, notes, memories, letters }), [now, journal, notes, memories, letters]);
  const insights = useMemo(() => buildInsights(now, { notes, journal, thoughts, moods }), [now, notes, journal, thoughts, moods]);

  // ─────── Secret vault trigger ───────
  const navigate = useNavigate();
  const tapsRef = useRef<{ count: number; last: number }>({ count: 0, last: 0 });
  const [unlockFx, setUnlockFx] = useState(false);

  // If Home remounts while a vault entry is pending, keep showing the
  // cinematic; when the module timer fires we navigate regardless.
  useEffect(() => {
    if (unlockNavTimer !== null) {
      setUnlockFx(true);
      setUnlockCinematicPlaying(true);
    }
  }, []);

  const handleMood = (id: string) => {
    // Preserve normal mood logging first — nothing about this changes UX.
    logMood(id);

    const nowMs = Date.now();
    const t = tapsRef.current;
    // Only the first emoji counts; any other emoji or a >3s pause resets.
    if (id !== SECRET_MOOD_ID) { t.count = 0; t.last = 0; return; }
    if (nowMs - t.last > SECRET_WINDOW_MS) { t.count = 0; }
    t.count += 1;
    t.last = nowMs;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator).vibrate?.(8); } catch { /* ignore */ }
    }
    if (t.count >= SECRET_TAPS) {
      t.count = 0; t.last = 0;
      if (unlockNavTimer !== null) return;
      const wasUnlocked = isAlbumUnlocked();
      if (!wasUnlocked) unlockAlbum();
      setUnlockFx(true);
      setUnlockCinematicPlaying(true);
      try { (navigator as Navigator).vibrate?.([30, 40, 20, 50, 80]); } catch { /* ignore */ }
      if (!wasUnlocked) {
        toast.success("Private Album Unlocked", { description: "A quiet space, just for you." });
      }
      try { sessionStorage.setItem("lumina.privateAlbum.justEntered", "1"); } catch { /* ignore */ }
      // Compact ritual: long enough to feel, short enough not to feel stuck.
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      unlockNavTimer = window.setTimeout(() => {
        unlockNavTimer = null;
        setUnlockFx(false);
        setUnlockCinematicPlaying(false);
        navigate({ to: "/app/private" });
      }, reduce ? 420 : 1450);
    }
  };

  const todayMoodValue = moods.find((x) => x.date === now.toISOString().slice(0, 10))?.mood;
  const todayMoodResolved = resolveMood(todayMoodValue, customMoods);

  return (
    <div data-page="home" className="space-y-6 pb-32">
      <AnimatePresence>
        {unlockFx && <UnlockCinematic />}
      </AnimatePresence>

      <PageHeader
        eyebrow={now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        title={greeting.title}
        subtitle={greeting.sub}
        actions={
          <div className="glass hidden rounded-3xl px-5 py-3 text-right sm:block">
            <div className="font-display text-3xl leading-none tracking-tight">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              local time
            </div>
          </div>
        }
      />

      {/* Row 1 — whisper + mood (compact hero) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2 overflow-hidden !p-5 sm:!p-6">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> today's whisper · {whisper.category}
          </div>
          <p className="mt-3 font-display text-[1.5rem] leading-[1.25] text-foreground sm:text-[2rem] sm:leading-[1.22]">
            "{whisper.text}"
          </p>
          <p className="mt-3 font-hand text-xl text-[oklch(0.6_0.15_340)] sm:text-2xl">— your Lumina, cheering you on</p>
        </GlassCard>

        <GlassCard className="!p-5 sm:!p-6">
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">how are you feeling today?</div>
          <MoodPicker
            className="mt-4"
            value={todayMoodValue}
            onChange={handleMood}
            compact
          />
          <div className="mt-4 flex items-center gap-2 border-t border-white/40 pt-3 text-xs text-muted-foreground dark:border-white/10">
            <span className="uppercase tracking-widest">Today</span>
            {todayMoodResolved ? (
              <>
                <MoodBadge value={todayMoodValue} size="md" />
                <span className="font-medium text-foreground">{todayMoodResolved.title}</span>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Row 2 — on this day */}
      {otd.length > 0 && (
        <GlassCard className="!p-6 sm:!p-8">
          <div className="mb-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> on this day
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {otd.slice(0, 6).map((item, i) => {
              let title = "";
              let to: "/app/journal/$id" | "/app/notes/$id" | "/app/letters/$id" | "/app/memories/$id" = "/app/notes/$id";
              let id = "";
              if (item.kind === "journal") {
                title = item.entry.highlight || item.entry.reflection || "Journal entry";
                to = "/app/journal/$id"; id = item.entry.id;
              } else if (item.kind === "note") {
                title = item.note.title || "Untitled note";
                to = "/app/notes/$id"; id = item.note.id;
              } else if (item.kind === "letter") {
                title = `Letter to ${item.letter.to || "someone"}`;
                to = "/app/letters/$id"; id = item.letter.id;
              } else {
                title = item.memory.caption || "A memory";
                to = "/app/memories/$id"; id = item.memory.id;
              }
              return (
                <li key={i}>
                  <Link to={to} params={{ id }} className="block rounded-2xl bg-white/50 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-md dark:bg-white/5 dark:hover:bg-white/10">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {item.yearsAgo === 1 ? "1 year ago" : `${item.yearsAgo} years ago`} · {item.kind}
                    </div>
                    <div className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">{String(title).slice(0, 120)}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </GlassCard>
      )}

      {insights.length > 0 && (
        <GlassCard className="!p-6">
          <div className="mb-4 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">a gentle notice</div>
          <div className="flex flex-wrap gap-2">
            {insights.map((ins, i) => (
              <span key={i} className="rounded-full bg-white/60 px-4 py-2 text-sm dark:bg-white/5">
                {ins.tone === "cheer" ? "✨ " : ins.tone === "notice" ? "🌿 " : "🌸 "} {ins.text}
              </span>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Row 3 — recent notes + quick actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2 !p-5 sm:!p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-2xl leading-tight">Recent notes</h3>
            <Link to="/app/notes" className="-mr-2 inline-flex min-h-10 items-center rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground">
              see all →
            </Link>
          </div>
          {notes.length === 0 ? (
            <EmptyRow msg="Your first note begins here." to="/app/notes/new" cta="Create note" />
          ) : (
            <ul className={notes.length === 1 ? "space-y-0" : "space-y-2"}>
              {notes.slice(0, 4).map((n) => (
                <li key={n.id}>
                  <Link
                    to="/app/notes"
                    className="flex items-center justify-between gap-4 rounded-2xl bg-white/50 px-4 py-3 transition duration-200 hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-md active:translate-y-0 active:scale-[0.99] dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium leading-snug">{n.title || "Untitled"}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {n.content.slice(0, 90) || "no content yet"}
                      </div>
                    </div>
                    <div className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {new Date(n.updatedAt).toLocaleDateString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="!p-5 sm:!p-6">
          <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <HeartHandshake className="h-3.5 w-3.5" /> quick actions
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <QA to="/app/notes" label="New note" />
            <QA to="/app/journal" label="Journal today" />
            <QA to="/app/thoughts" label="Capture thought" />
            <QA to="/app/letters" label="Write letter" />
          </div>
          <div className="mt-6 border-t border-white/40 pt-4 dark:border-white/10">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">latest thoughts</div>
            <ul className="mt-3 space-y-2">
              {thoughts.slice(0, 3).map((t) => (
                <li key={t.id} className="rounded-xl bg-white/50 px-3 py-2.5 text-sm leading-snug dark:bg-white/5">
                  {t.text.slice(0, 80)}
                </li>
              ))}
              {thoughts.length === 0 && (
                <li className="text-xs italic text-muted-foreground">Nothing captured yet.</li>
              )}
            </ul>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}


function QA({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex h-12 w-full items-center justify-center rounded-2xl border border-white/60 bg-white/50 px-3 text-center text-xs font-medium transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/80 hover:shadow-sm active:translate-y-0 active:scale-[0.97] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
    >
      {label}
    </Link>
  );
}

function EmptyRow({ msg, to, cta }: { msg: string; to: string; cta: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/70 bg-white/30 px-6 py-8 text-center dark:border-white/10">
      <div className="relative mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.95_0.08_340)] to-[oklch(0.9_0.08_290)] text-2xl shadow-inner dark:from-white/10 dark:to-white/5">
        <span aria-hidden>📝</span>
        <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 text-sm">✨</span>
      </div>
      <p className="font-display text-lg leading-snug">{msg}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">A blank page is a kind place to start.</p>
      <Link
        to={to}
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] px-5 py-2.5 text-xs font-medium text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98]"
      >
        {cta}
      </Link>
    </div>
  );
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