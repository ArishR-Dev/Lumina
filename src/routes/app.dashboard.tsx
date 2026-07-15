import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  BarChart, Bar,
} from "recharts";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { MoodBadge } from "@/components/lumina/MoodBadge";
import { useLumina } from "@/lib/lumina-store";
import { resolveMood } from "@/lib/lumina-moods";
import { wordsFromHtml } from "@/lib/lumina-timeline";
import { motion, useReducedMotion } from "framer-motion";

export const Route = createFileRoute("/app/dashboard")({ component: Dashboard });

const MOOD_SCORE: Record<string, number> = {
  radiant: 5, happy: 4, calm: 3, tender: 3, thoughtful: 3, tired: 2, blue: 1, anxious: 1,
};

function Dashboard() {
  const notes = useLumina((s) => s.notes);
  const journal = useLumina((s) => s.journal);
  const thoughts = useLumina((s) => s.thoughts);
  const moods = useLumina((s) => s.moods);
  const customMoods = useLumina((s) => s.customMoods);
  const tasks = useLumina((s) => s.tasks);
  const habits = useLumina((s) => s.habits);
  const letters = useLumina((s) => s.letters);
  const memories = useLumina((s) => s.memories);
  const capsules = useLumina((s) => s.capsules);
  const reduce = useReducedMotion();

  const stats = useMemo(() => {
    const words = notes.reduce((a, n) => a + wordsFromHtml(n.content), 0);
    const done = tasks.filter((t) => t.done).length;
    const completionRate = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    const todayKey = new Date().toISOString().slice(0, 10);
    const habitsDoneToday = habits.filter((h) => h.days.includes(todayKey)).length;
    const habitDaysTotal = habits.reduce((sum, h) => sum + h.days.length, 0);
    const { current: streak, longest } = computeStreaks(journal.map((j) => j.date).sort());
    const openedCapsules = capsules.filter((c) => c.opened).length;
    const favoritesTotal =
      notes.filter((n) => n.favorite && !n.trashed).length +
      journal.filter((j) => j.favorite).length +
      thoughts.filter((t) => t.favorite).length +
      letters.filter((l) => l.favorite).length +
      memories.filter((m) => m.favorite).length +
      tasks.filter((t) => t.favorite).length +
      capsules.filter((c) => c.favorite).length;
    return { words, done, completionRate, habitsDoneToday, habitDaysTotal, streak, longest, openedCapsules, favoritesTotal };
  }, [notes, journal, thoughts, moods, tasks, habits, letters, memories, capsules]);

  // 30-day mood trend
  const moodTrend = useMemo(() => {
    const arr: { date: string; label: string; score: number | null }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const m = moods.find((x) => x.date === key);
      const score = m ? (MOOD_SCORE[m.mood] ?? 3) : null;
      arr.push({ date: key, label: d.toLocaleDateString(undefined, { day: "numeric" }), score });
    }
    return arr;
  }, [moods]);

  // 30-day writing activity (words / entries) trend
  const writing = useMemo(() => {
    const arr: { date: string; label: string; words: number; entries: number }[] = [];
    const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(undefined, { day: "numeric" });
      const dayNotes = notes.filter((n) => !n.trashed && dayKey(n.updatedAt) === key);
      const dayJournal = journal.filter((j) => j.date === key);
      const dayThoughts = thoughts.filter((t) => dayKey(t.createdAt) === key);
      const dayLetters = letters.filter((l) => dayKey(l.createdAt) === key);
      const words =
        dayNotes.reduce((a, n) => a + wordsFromHtml(n.content), 0) +
        dayJournal.reduce((a, j) => a + (j.gratitude + " " + j.reflection + " " + j.highlight).trim().split(/\s+/).filter(Boolean).length, 0) +
        dayThoughts.reduce((a, t) => a + t.text.trim().split(/\s+/).filter(Boolean).length, 0) +
        dayLetters.reduce((a, l) => a + l.body.trim().split(/\s+/).filter(Boolean).length, 0);
      arr.push({
        date: key,
        label,
        words,
        entries: dayNotes.length + dayJournal.length + dayThoughts.length + dayLetters.length,
      });
    }
    return arr;
  }, [notes, journal, thoughts, letters]);

  // 14-day task completion (created vs done that day)
  const taskChart = useMemo(() => {
    const arr: { date: string; label: string; created: number; done: number }[] = [];
    const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      const created = tasks.filter((t) => dayKey(t.createdAt) === key).length;
      const done = tasks.filter((t) => t.done && dayKey(t.createdAt) === key).length;
      arr.push({ date: key, label, created, done });
    }
    return arr;
  }, [tasks]);

  const anim = reduce ? { initial: false, animate: {} } : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <div>
      <PageHeader eyebrow="a glance at you" title="Insights" subtitle="Your little numbers, kindly kept." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Writing streak" value={`${stats.streak}d`} sub={`longest ${stats.longest}d`} />
        <Stat label="Task completion" value={`${stats.completionRate}%`} sub={`${stats.done}/${tasks.length}`} />
        <Stat label="Habit days" value={stats.habitDaysTotal} sub={`${stats.habitsDoneToday} today`} />
        <Stat label="Favorites" value={stats.favoritesTotal} sub={`${stats.openedCapsules} capsules opened`} />
        <Stat label="Notes" value={notes.filter((n) => !n.trashed).length} sub={`${stats.words.toLocaleString()} words`} />
        <Stat label="Journal" value={journal.length} />
        <Stat label="Letters" value={letters.length} />
        <Stat label="Memories" value={memories.length} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.div {...anim}>
          <GlassCard>
            <h3 className="font-display text-2xl">Mood, last 30 days</h3>
            <p className="text-xs text-muted-foreground">1 = tender, 5 = radiant</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={moodTrend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="oklch(0.85 0.02 300 / 0.35)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                  <YAxis domain={[1, 5]} tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none", background: "var(--card)" }} />
                  <Line type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={!reduce} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {moods.slice(0, 7).map((m) => {
                const r = resolveMood(m.mood, customMoods);
                return (
                  <div key={m.date} className="inline-flex items-center gap-2 rounded-2xl bg-white/50 px-3 py-1.5 text-xs dark:bg-white/5">
                    <MoodBadge value={m.mood} size="md" />
                    {r && <span className="font-medium">{r.title}</span>}
                    <span className="text-muted-foreground">{m.date.slice(5)}</span>
                  </div>
                );
              })}
              {moods.length === 0 && <p className="text-sm text-muted-foreground">No moods logged yet.</p>}
            </div>
          </GlassCard>
        </motion.div>

        <motion.div {...anim}>
          <GlassCard>
            <h3 className="font-display text-2xl">Writing activity, last 30 days</h3>
            <p className="text-xs text-muted-foreground">Words written across notes, journal, thoughts, letters</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={writing} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="wordsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="oklch(0.85 0.02 300 / 0.35)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none", background: "var(--card)" }} />
                  <Area type="monotone" dataKey="words" stroke="var(--primary)" fill="url(#wordsFill)" strokeWidth={2} isAnimationActive={!reduce} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div {...anim}>
          <GlassCard>
            <h3 className="font-display text-2xl">Tasks, last 14 days</h3>
            <p className="text-xs text-muted-foreground">Created vs. completed on the day they were created</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskChart} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="oklch(0.85 0.02 300 / 0.35)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none", background: "var(--card)" }} />
                  <Bar dataKey="created" fill="var(--muted-foreground)" radius={[6, 6, 0, 0]} isAnimationActive={!reduce} />
                  <Bar dataKey="done" fill="var(--primary)" radius={[6, 6, 0, 0]} isAnimationActive={!reduce} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div {...anim}>
          <GlassCard>
            <h3 className="font-display text-2xl">Writing streaks</h3>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/50 p-6 text-center dark:bg-white/5">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">current</div>
                <div className="mt-2 font-display text-5xl">{stats.streak}<span className="text-xl text-muted-foreground">d</span></div>
              </div>
              <div className="rounded-2xl bg-white/50 p-6 text-center dark:bg-white/5">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">longest</div>
                <div className="mt-2 font-display text-5xl">{stats.longest}<span className="text-xl text-muted-foreground">d</span></div>
              </div>
            </div>
            <div className="mt-6">
              <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">last 30 days</div>
              <div className="mt-3 grid grid-flow-col grid-rows-3 gap-1.5">
                {writing.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.words} words`}
                    className="h-4 w-4 rounded-md"
                    style={{
                      background: d.words === 0
                        ? "color-mix(in oklab, var(--muted) 80%, transparent)"
                        : `color-mix(in oklab, var(--primary) ${20 + Math.min(Math.floor(d.words / 40), 5) * 15}%, transparent)`,
                    }}
                  />
                ))}
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <GlassCard className="p-4">
      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl">{value}</div>
      {sub && <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{sub}</div>}
    </GlassCard>
  );
}

function computeStreaks(datesAsc: string[]) {
  const set = new Set(datesAsc);
  const today = new Date();
  let current = 0;
  for (let i = 0; ; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if (set.has(d.toISOString().slice(0, 10))) current++;
    else break;
  }
  let longest = 0, run = 0;
  const sorted = [...set].sort();
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) { run = 1; longest = 1; continue; }
    const prev = new Date(sorted[i - 1]);
    const cur = new Date(sorted[i]);
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86_400_000);
    run = diff === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}
