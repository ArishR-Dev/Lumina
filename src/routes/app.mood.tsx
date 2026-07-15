import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { MoodPicker } from "@/components/lumina/MoodPicker";
import { MoodBadge } from "@/components/lumina/MoodBadge";
import { useLumina } from "@/lib/lumina-store";
import { resolveMood } from "@/lib/lumina-moods";
import { notify } from "@/lib/lumina-toasts";

export const Route = createFileRoute("/app/mood")({ component: MoodPage });

function MoodPage() {
  const moods = useLumina((s) => s.moods);
  const customMoods = useLumina((s) => s.customMoods);
  const logMood = useLumina((s) => s.logMood);
  const [note, setNote] = useState("");
  const [pick, setPick] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const todayLog = moods.find((m) => m.date === today);
  const todayResolved = resolveMood(todayLog?.mood, customMoods);

  const monthCells = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startPad = (first.getDay() + 6) % 7; // start Monday
    const cells: { date: string | null; mood?: string }[] = [];
    for (let i = 0; i < startPad; i++) cells.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = new Date(year, month, d).toISOString().slice(0, 10);
      const m = moods.find((x) => x.date === key)?.mood;
      cells.push({ date: key, mood: m });
    }
    return cells;
  }, [moods]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of moods) m[x.mood] = (m[x.mood] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [moods]);

  const todayNumericDate = today;
  const last7 = useMemo(() => {
    const cells: { date: string; mood?: string; label: string }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      cells.push({
        date: key,
        mood: moods.find((x) => x.date === key)?.mood,
        label: d.toLocaleDateString(undefined, { weekday: "narrow" }),
      });
    }
    return cells;
  }, [moods]);

  const insight = useMemo(() => {
    if (counts.length === 0) return null;
    const [topMood, n] = counts[0];
    const r = resolveMood(topMood, customMoods);
    return {
      top: r?.title ?? topMood,
      count: n,
      total: moods.length,
    };
  }, [counts, customMoods, moods.length]);

  return (
    <div className="space-y-8 pb-32">
      <PageHeader
        eyebrow="how you feel today"
        title="Mood"
        subtitle="A gentle record of every little weather inside you."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <GlassCard className="!p-6 sm:!p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Today</div>
          <div className="mt-1.5 font-display text-2xl leading-tight sm:text-3xl">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>

          <MoodPicker
            className="mt-6"
            label="Pick your feeling"
            value={pick}
            onChange={setPick}
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="A quick word about why…"
            className="mt-5 min-h-[110px] w-full resize-none rounded-2xl border border-white/50 bg-white/50 p-4 text-[15px] leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)] dark:border-white/10 dark:bg-white/5"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={() => {
              if (pick) {
                logMood(pick, note);
                setNote("");
                setPick("");
                notify.saved("Mood saved");
              }
            }}
            disabled={!pick}
            className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_14px_36px_-14px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
          >
            Save today
            {todayResolved && (
              <span className="ml-1 inline-flex items-center gap-1 opacity-80">
                · replacing <MoodBadge value={todayLog?.mood} size="sm" />
              </span>
            )}
          </button>

          {/* Weekly trend */}
          <div className="mt-9 border-t border-white/40 pt-7 dark:border-white/10">
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="font-display text-xl leading-tight">This week</h3>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">last 7 days</span>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {last7.map((c) => {
                const isToday = c.date === todayNumericDate;
                return (
                  <div key={c.date} className="flex flex-col items-center gap-1.5">
                    <div
                      className={
                        "grid aspect-square w-full place-items-center rounded-2xl transition " +
                        (isToday
                          ? "bg-primary/15 ring-2 ring-primary/40"
                          : "bg-white/50 dark:bg-white/5")
                      }
                      title={c.mood ? resolveMood(c.mood, customMoods)?.title ?? undefined : "no entry"}
                    >
                      {c.mood ? (
                        <MoodBadge value={c.mood} size="md" />
                      ) : (
                        <span className="text-lg text-muted-foreground/50">·</span>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {c.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monthly calendar */}
          <div className="mt-9 border-t border-white/40 pt-7 dark:border-white/10">
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="font-display text-xl leading-tight">This month</h3>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {new Date().toLocaleDateString(undefined, { month: "long" })}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-2 text-center">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div key={i} className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  {d}
                </div>
              ))}
              {monthCells.map((c, i) => {
                const isToday = c.date === todayNumericDate;
                return (
                  <div
                    key={i}
                    className={
                      "grid aspect-square place-items-center rounded-xl text-lg transition " +
                      (c.date
                        ? isToday
                          ? "bg-primary/15 ring-2 ring-primary/40"
                          : "bg-white/50 dark:bg-white/5"
                        : "opacity-0")
                    }
                    title={c.mood ? resolveMood(c.mood, customMoods)?.title ?? undefined : undefined}
                  >
                    {c.mood ? (
                      <MoodBadge value={c.mood} size="md" />
                    ) : c.date ? (
                      <span className="text-xs text-muted-foreground/70">{new Date(c.date).getDate()}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </GlassCard>

        <div className="space-y-6">
          {/* AI-style insight card */}
          <GlassCard className="!p-6 relative overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-40 blur-2xl"
              style={{ background: "radial-gradient(circle, oklch(0.85 0.13 340 / .6), transparent 70%)" }}
            />
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              ✨ a gentle reading
            </div>
            {insight ? (
              <p className="mt-3 font-display text-lg leading-snug">
                You've most often felt{" "}
                <span className="text-gradient font-medium">{insight.top}</span>
                {" "}lately — <span className="text-muted-foreground">{insight.count} of {insight.total} entries.</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Log a few days and Lumina will notice patterns for you.
              </p>
            )}
          </GlassCard>

          <GlassCard className="!p-6">
            <h3 className="font-display text-xl leading-tight">Trends</h3>
            <div className="mt-4 space-y-2.5">
              {counts.length === 0 && (
                <p className="text-sm italic text-muted-foreground">Log a feeling to begin tracking.</p>
              )}
              {counts.map(([m, n]) => {
                const max = counts[0]?.[1] ?? 1;
                const r = resolveMood(m, customMoods);
                return (
                  <div key={m} className="flex items-center gap-3">
                    <span className="flex w-24 items-center gap-2">
                      <MoodBadge value={m} size="md" />
                      <span className="truncate text-xs">{r?.title}</span>
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/50 dark:bg-white/10">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: (n / max) * 100 + "%" }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: r?.color.base ?? "var(--primary)" }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{n}</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="!p-6">
            <h3 className="font-display text-xl leading-tight">Recent</h3>
            {moods.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-white/70 p-6 text-center text-sm text-muted-foreground dark:border-white/10">
                Your mood diary is still blank. Pick a feeling above to begin.
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {moods.slice(0, 10).map((m) => {
                  const r = resolveMood(m.mood, customMoods);
                  return (
                    <li
                      key={m.date}
                      className="flex items-center gap-3 rounded-2xl border border-white/50 bg-white/50 p-3 text-sm transition hover:-translate-y-0.5 hover:bg-white/70 hover:shadow-sm dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      <MoodBadge value={m.mood} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">
                            {new Date(m.date).toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          {r && <span className="text-muted-foreground">· {r.title}</span>}
                        </div>
                        {m.note && <div className="mt-0.5 truncate text-xs text-muted-foreground">{m.note}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

