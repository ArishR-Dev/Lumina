import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Filter as FilterIcon, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { useLumina } from "@/lib/lumina-store";
import {
  eventsFromCapsules,
  eventsFromHabits,
  eventsFromJournal,
  eventsFromLetters,
  eventsFromMemories,
  eventsFromMoods,
  eventsFromNotes,
  eventsFromTasks,
  eventsFromThoughts,
  groupTimeline,
  mergeTimelineEvents,
  type TimelineEvent,
} from "@/lib/lumina-timeline";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/timeline")({ component: TimelinePage });

const SCROLL_KEY = "lumina:timeline:scroll";
const FOCUS_KEY = "lumina:timeline:focus";
const LIMIT_KEY = "lumina:timeline:limit";

const TYPES: TimelineEvent["type"][] = [
  "note", "journal", "thought", "letter", "memory",
  "task", "task_done", "mood", "capsule_sealed", "capsule_opened",
  "habit", "achievement",
];
const LABEL: Record<TimelineEvent["type"], string> = {
  note: "Notes", journal: "Journal", thought: "Thoughts", letter: "Letters",
  memory: "Memories", task: "Tasks", task_done: "Tasks done", mood: "Mood",
  capsule_sealed: "Capsules sealed", capsule_opened: "Capsules opened",
  habit: "Habits", achievement: "Achievements",
};

function TimelinePage() {
  // Per-slice subscriptions so unrelated slice updates don't rebuild
  // every event list. Each `useMemo` below is now keyed to a single
  // slice and can be reused across renders when that slice is stable.
  const notes = useLumina((s) => s.notes);
  const journal = useLumina((s) => s.journal);
  const thoughts = useLumina((s) => s.thoughts);
  const letters = useLumina((s) => s.letters);
  const memories = useLumina((s) => s.memories);
  const tasks = useLumina((s) => s.tasks);
  const moods = useLumina((s) => s.moods);
  const customMoods = useLumina((s) => s.customMoods);
  const capsules = useLumina((s) => s.capsules);
  const habits = useLumina((s) => s.habits);
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [active, setActive] = useState<TimelineEvent["type"][]>([...TYPES]);
  const [limit, setLimit] = useState(() => {
    if (typeof window === "undefined") return 40;
    const stored = Number(sessionStorage.getItem(LIMIT_KEY));
    return stored > 0 ? stored : 40;
  });
  const restoredRef = useRef(false);
  const [hydrating, setHydrating] = useState(true);
  useEffect(() => {
    // Brief skeleton phase so the layout settles before the real list
    // (or empty state) flashes in.
    const t = window.setTimeout(() => setHydrating(false), 350);
    return () => window.clearTimeout(t);
  }, []);

  const filtersApplied = q.trim().length > 0 || active.length < TYPES.length;

  // Per-slice memoized event builders. Editing a note only invalidates
  // `noteEvents`; all others are reused. `mergeTimelineEvents` sorts
  // desc-by-time in one pass.
  const noteEvents = useMemo(() => eventsFromNotes(notes), [notes]);
  const journalEvents = useMemo(() => eventsFromJournal(journal, customMoods), [journal, customMoods]);
  const thoughtEvents = useMemo(() => eventsFromThoughts(thoughts), [thoughts]);
  const letterEvents = useMemo(() => eventsFromLetters(letters), [letters]);
  const memoryEvents = useMemo(() => eventsFromMemories(memories), [memories]);
  const taskEvents = useMemo(() => eventsFromTasks(tasks), [tasks]);
  const moodEvents = useMemo(() => eventsFromMoods(moods, customMoods), [moods, customMoods]);
  const capsuleEvents = useMemo(() => eventsFromCapsules(capsules), [capsules]);
  const habitEvents = useMemo(() => eventsFromHabits(habits), [habits]);

  const events = useMemo(
    () => mergeTimelineEvents(
      noteEvents, journalEvents, thoughtEvents, letterEvents, memoryEvents,
      taskEvents, moodEvents, capsuleEvents, habitEvents,
    ),
    [noteEvents, journalEvents, thoughtEvents, letterEvents, memoryEvents, taskEvents, moodEvents, capsuleEvents, habitEvents],
  );
  // Precompute per-event lowercase search string once per events change.
  // This avoids re-lowercasing every event on every keystroke.
  const haystacks = useMemo(
    () => events.map((e) => (e.title + " " + e.preview).toLowerCase()),
    [events],
  );
  const activeSet = useMemo(() => new Set(active), [active]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s && activeSet.size === TYPES.length) return events;
    const out: TimelineEvent[] = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!activeSet.has(e.type)) continue;
      if (s && !haystacks[i].includes(s)) continue;
      out.push(e);
    }
    return out;
  }, [events, haystacks, activeSet, q]);


  const buckets = useMemo(
    () => groupTimeline(filtered.slice(0, limit)),
    [filtered, limit],
  );

  const toggle = (t: TimelineEvent["type"]) =>
    setActive((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const openEntry = useCallback((e: TimelineEvent) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      sessionStorage.setItem(FOCUS_KEY, e.id);
      sessionStorage.setItem(LIMIT_KEY, String(limit));
    }
    navigate({ to: e.href });
  }, [limit, navigate]);

  // Restore scroll + focus when returning to the timeline.
  useLayoutEffect(() => {
    if (restoredRef.current) return;
    if (typeof window === "undefined") return;
    const y = Number(sessionStorage.getItem(SCROLL_KEY));
    if (y > 0) {
      // Wait a frame so the list has rendered.
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
    }
    const fid = sessionStorage.getItem(FOCUS_KEY);
    if (fid) {
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-tl-id="${CSS.escape(fid)}"]`);
        el?.focus({ preventScroll: true });
      });
    }
    sessionStorage.removeItem(SCROLL_KEY);
    sessionStorage.removeItem(FOCUS_KEY);
    restoredRef.current = true;
  }, []);





  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="a life, unfolding"
        title="Timeline"
        subtitle="Every note, page, and photograph — kept together in one gentle stream."
      />

      <GlassCard className="!p-4 sm:!p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 sm:min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by word, feeling, or memory…"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              aria-label="Filter timeline"
              className="h-11 w-full rounded-2xl border border-white/80 bg-white/80 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground transition focus:border-primary/60 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)] dark:border-white/15 dark:bg-white/10"
            />
          </div>
          {/* Mobile: single horizontal scroll strip with right-edge fade.
              Desktop (sm+): reverts to wrapping pill row. */}
          <div className="relative -mx-1 sm:mx-0">
            <div className="flex items-center gap-1.5 overflow-x-auto px-1 pb-1 pr-8 no-scrollbar sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-1 text-[11px]">
              <FilterIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(t)}
                  className={cn(
                    "min-h-9 shrink-0 rounded-full px-3 py-1.5 uppercase tracking-widest transition",
                    active.includes(t)
                      ? "bg-primary/20 font-medium text-foreground"
                      : "text-foreground/60 hover:bg-white/60 hover:text-foreground dark:text-foreground/70 dark:hover:bg-white/10",
                  )}
                >
                  {LABEL[t]}
                </button>
              ))}
            </div>
            <div aria-hidden className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white/80 to-transparent dark:from-neutral-950/60 sm:hidden" />
          </div>
        </div>
      </GlassCard>

      {hydrating ? (
        <TimelineSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyTimeline
          filtersApplied={filtersApplied}
          onReset={() => {
            setQ("");
            setActive([...TYPES]);
          }}
          onNavigate={(to) => navigate({ to })}
        />
      ) : (
        <div className="relative">
          {/* Connector line — aligned to the center of the timeline icons.
              Icons are h-9 (36px) at left-[6px] (mobile) / left-[10px] (md).
              Center = left + 18 → 24px mobile, 28px md. */}
          <div className="pointer-events-none absolute inset-y-4 left-6 w-px bg-gradient-to-b from-primary/50 via-primary/20 to-transparent md:left-7" />
          {buckets.map((bucket, bi) => (
            <motion.section
              key={bucket.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: bi * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="relative mb-10 last:mb-0"
            >
              <div className="mb-5 flex items-center gap-3 pl-12 md:pl-16">
                <div className="font-display text-2xl leading-none">{bucket.label}</div>
                <div className="h-px flex-1 bg-gradient-to-r from-primary/25 to-transparent" />
                <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  {bucket.events.length}
                </div>
              </div>
              <ul className="lumina-virtual-list space-y-4">
                {bucket.events.map((e) => (
                  <TimelineRow key={e.id} event={e} onOpen={openEntry} />
                ))}
              </ul>
            </motion.section>
          ))}
          {filtered.length > limit && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setLimit((n) => n + 40)}
                className="rounded-full border border-white/60 bg-white/60 px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-white/5"
              >
                Show more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



/**
 * TimelineRow — memoized row renderer. Because `onOpen` is stabilized via
 * useCallback in the parent and `event` references are only reallocated
 * when their source slice actually changes, most bucket updates skip the
 * row body entirely. Motion-per-item is replaced with a CSS keyframe
 * (`.tl-row-enter`) so we don't spin up a framer-motion instance per row.
 */
const TimelineRow = memo(function TimelineRow({
  event,
  onOpen,
}: {
  event: TimelineEvent;
  onOpen: (e: TimelineEvent) => void;
}) {
  return (
    <li className="tl-row-enter relative pl-12 md:pl-16">
      <span className="absolute left-1.5 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/60 bg-white/90 text-base shadow-md ring-2 ring-primary/10 md:left-2.5 dark:border-white/10 dark:bg-white/10">
        {event.icon}
      </span>
      <button
        type="button"
        data-tl-id={event.id}
        aria-label={`Open ${event.title}`}
        onClick={() => onOpen(event)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onOpen(event);
          }
        }}
        className="glass block w-full rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:-translate-y-0.5 focus-visible:shadow-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 truncate font-medium">{event.title}</div>
          <div className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
            {new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        {event.preview && (
          <div className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{event.preview}</div>
        )}
      </button>
    </li>
  );
});


function TimelineSkeleton() {
  const groups = [0, 1];
  const rows = [0, 1, 2];
  return (
    <div className="relative" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading timeline…</span>
      <div className="pointer-events-none absolute inset-y-4 left-[19px] w-px bg-gradient-to-b from-primary/30 via-primary/10 to-transparent md:left-[27px]" />
      {groups.map((g) => (
        <section key={g} className="relative mb-8">
          <div className="mb-4 flex items-center gap-3 pl-10 md:pl-14">
            <div className="h-6 w-32 animate-pulse rounded-md bg-white/70 dark:bg-white/10" />
            <div className="h-px flex-1 bg-gradient-to-r from-primary/15 to-transparent" />
            <div className="h-3 w-6 animate-pulse rounded bg-white/60 dark:bg-white/10" />
          </div>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r} className="relative pl-10 md:pl-14">
                <span className="absolute left-1.5 top-3 h-9 w-9 animate-pulse rounded-full border border-white/60 bg-white/80 shadow-md ring-2 ring-primary/10 md:left-2.5 dark:border-white/10 dark:bg-white/10" />
                <div className="glass block w-full rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-white/70 dark:bg-white/10" />
                    <div className="h-3 w-10 animate-pulse rounded bg-white/60 dark:bg-white/10" />
                  </div>
                  <div className="mt-3 h-3 w-11/12 animate-pulse rounded bg-white/60 dark:bg-white/10" />
                  <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-white/60 dark:bg-white/10" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type OnboardTo = "/app/notes/new" | "/app/journal" | "/app/thoughts" | "/app/memories";

function EmptyTimeline({
  filtersApplied,
  onReset,
  onNavigate,
}: {
  filtersApplied: boolean;
  onReset: () => void;
  onNavigate: (to: OnboardTo) => void;
}) {
  return (
    <GlassCard className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center sm:py-20">
      <div className="relative grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-inner">
        <Sparkles className="h-7 w-7" aria-hidden="true" />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-full blur-xl"
          style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 30%, transparent), transparent 70%)" }}
        />
      </div>
      {filtersApplied ? (
        <>
          <div className="font-display text-2xl leading-snug">No entries match your filters</div>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Try a different search term, or bring back a category you've hidden.
          </p>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-white/60 bg-white/70 px-4 py-2 text-xs font-medium uppercase tracking-widest text-foreground transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/10 dark:bg-white/5"
          >
            Clear filters
          </button>
        </>
      ) : (
        <>
          <div className="font-display text-2xl leading-snug">Your timeline is still quiet</div>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Nothing here yet — every note, journal page, thought, or memory you keep will find its place on this gentle stream.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {([
              ["/app/notes/new", "📝 Write a note"],
              ["/app/journal", "🌸 Open journal"],
              ["/app/thoughts", "💭 Capture a thought"],
              ["/app/memories", "📸 Add a memory"],
            ] as const).map(([to, label]) => (
              <button
                key={to}
                type="button"
                onClick={() => onNavigate(to)}
                className="rounded-full border border-white/60 bg-white/60 px-3.5 py-1.5 text-xs text-foreground/80 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/80 active:translate-y-0 active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
}
