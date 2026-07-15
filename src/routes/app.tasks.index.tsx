import { createFileRoute } from "@tanstack/react-router";
import { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Heart, Plus, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { useLumina, type TaskExt } from "@/lib/lumina-store";

import { notify } from "@/lib/lumina-toasts";

export const Route = createFileRoute("/app/tasks/")({ component: TasksPage });

const EXAMPLE_TASKS = [
  "Drink a glass of water",
  "Take five slow breaths",
  "Write one line in your journal",
  "Step outside for a moment",
];

function TasksPage() {
  const tasks = useLumina((s) => s.tasks);
  const addTask = useLumina((s) => s.addTask);
  const toggleTask = useLumina((s) => s.toggleTask);
  const deleteTask = useLumina((s) => s.deleteTask);
  const toggleFavorite = useLumina((s) => s.toggleFavorite);
  const [text, setText] = useState("");
  const [celebrateId, setCelebrateId] = useState<string | null>(null);

  const { done, total, pct } = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, pct };
  }, [tasks]);

  const allDone = total > 0 && done === total;

  // Group tasks: Today (open, due today or no due), Upcoming (future due), Completed.
  const { today, upcoming, completed } = useMemo(() => {
    const iso = new Date().toISOString().slice(0, 10);
    const today: TaskExt[] = [];
    const upcoming: TaskExt[] = [];
    const completed: TaskExt[] = [];
    for (const raw of tasks) {
      const t = raw as TaskExt;
      if (t.done) { completed.push(t); continue; }
      if (t.due && t.due > iso) upcoming.push(t);
      else today.push(t);
    }
    upcoming.sort((a, b) => (a.due || "").localeCompare(b.due || ""));
    return { today, upcoming, completed };
  }, [tasks]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (v) { addTask(v); setText(""); notify.created("Task"); }
  };

  return (
    <div className="space-y-6 pb-32">
      <PageHeader eyebrow="soft to-dos" title="Tasks" subtitle="Small gentle steps, one at a time." />

      <GlassCard className="!p-5 sm:!p-6">
        {/* Progress bar */}
        <div className="mb-5">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Today's progress</div>
            <div className="text-xs tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{done}</span> / {total} · {pct}%
            </div>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-white/50 dark:bg-white/5">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)]"
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 28 }}
            />
          </div>
          <AnimatePresence>
            {allDone && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-medium text-foreground"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Everything done — enjoy the calm.
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a little intention…"
            className="h-12 flex-1 rounded-2xl border border-white/60 bg-white/60 px-4 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/50 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)] dark:border-white/10 dark:bg-white/5"
          />
          <button
            className="inline-flex h-12 min-h-11 items-center gap-1.5 rounded-full bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] px-5 text-sm font-medium text-white shadow-md transition duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add</span>
          </button>
        </form>

        {tasks.length === 0 ? (
          <TasksEmpty
            onQuickAdd={(t) => { addTask(t); notify.created("Task"); }}
          />
        ) : (
          <div className="mt-6 space-y-6">
            {today.length > 0 && (
              <TaskGroup label="Today" count={today.length}>
                {today.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    celebrateId={celebrateId}
                    onToggle={() => {
                      const wasDone = t.done;
                      toggleTask(t.id);
                      if (!wasDone) {
                        notify.completed("Task");
                        setCelebrateId(t.id);
                        window.setTimeout(() => setCelebrateId((c) => (c === t.id ? null : c)), 900);
                      } else {
                        notify.reopened("Task");
                      }
                    }}
                    onFav={() => {
                      const wasFav = !!t.favorite;
                      toggleFavorite("task", t.id);
                      notify.favorited(!wasFav);
                    }}
                    onDelete={() => { deleteTask(t.id); notify.deleted("Task"); }}
                  />
                ))}
              </TaskGroup>
            )}

            {upcoming.length > 0 && (
              <TaskGroup label="Upcoming" count={upcoming.length}>
                {upcoming.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    celebrateId={celebrateId}
                    onToggle={() => { toggleTask(t.id); notify.completed("Task"); }}
                    onFav={() => { const wasFav = !!t.favorite; toggleFavorite("task", t.id); notify.favorited(!wasFav); }}
                    onDelete={() => { deleteTask(t.id); notify.deleted("Task"); }}
                  />
                ))}
              </TaskGroup>
            )}

            {completed.length > 0 && (
              <TaskGroup label="Completed" count={completed.length}>
                {completed.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    celebrateId={celebrateId}
                    onToggle={() => { toggleTask(t.id); notify.reopened("Task"); }}
                    onFav={() => { const wasFav = !!t.favorite; toggleFavorite("task", t.id); notify.favorited(!wasFav); }}
                    onDelete={() => { deleteTask(t.id); notify.deleted("Task"); }}
                  />
                ))}
              </TaskGroup>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function TaskGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        <span>{label}</span>
        <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] tabular-nums text-foreground/70 dark:bg-white/10">
          {count}
        </span>
      </div>
      <ul className="lumina-virtual-list space-y-2.5">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
    </section>
  );
}

const TaskRow = memo(function TaskRow({
  task: t,
  celebrateId,
  onToggle,
  onFav,
  onDelete,
}: {
  task: TaskExt;
  celebrateId: string | null;
  onToggle: () => void;
  onFav: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.li
      key={t.id}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.2 }}
      className="relative flex items-center gap-3 rounded-2xl border border-white/50 bg-white/50 p-3.5 transition hover:bg-white/70 dark:border-white/10 dark:bg-white/5"
    >
      <button
        onClick={onToggle}
        aria-label={t.done ? "Mark as not done" : "Complete task"}
        className={
          "relative grid h-7 w-7 shrink-0 place-items-center rounded-full border transition duration-200 " +
          (t.done
            ? "border-transparent bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] text-white shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
            : "border-white/70 bg-white/60 hover:border-primary/50 hover:bg-white dark:border-white/15 dark:bg-white/5")
        }
      >
        {t.done && <Check className="h-4 w-4" />}
        <AnimatePresence>
          {celebrateId === t.id && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0.8 }}
              animate={{ scale: 2.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 rounded-full bg-primary/30"
            />
          )}
        </AnimatePresence>
      </button>

      <div className="min-w-0 flex-1">
        <div className={"text-[15px] leading-snug transition " + (t.done ? "text-muted-foreground line-through" : "")}>
          {t.text}
        </div>
        {t.due && !t.done && (
          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            due {new Date(t.due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </div>
        )}
      </div>

      <button
        onClick={onFav}
        aria-label={t.favorite ? "Unfavorite" : "Favorite"}
        aria-pressed={!!t.favorite}
        className="p-1.5 text-muted-foreground transition hover:scale-110 hover:text-rose-500"
      >
        <Heart className={t.favorite ? "h-4 w-4 fill-rose-500 text-rose-500" : "h-4 w-4"} />
      </button>
      <button
        onClick={onDelete}
        aria-label="Delete task"
        className="p-1.5 text-muted-foreground transition hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </motion.li>
  );
});

function TasksEmpty({ onQuickAdd }: { onQuickAdd: (t: string) => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-white/70 bg-white/30 px-6 py-10 text-center dark:border-white/10">
      <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.95_0.08_340)] to-[oklch(0.9_0.08_290)] text-2xl shadow-inner dark:from-white/10 dark:to-white/5">
        <span aria-hidden>🌿</span>
        <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 text-sm">✨</span>
      </div>
      <p className="font-display text-2xl leading-snug">A gentle, open day.</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Nothing on the list yet — write a little intention above, or try one of these soft starts.
      </p>
      <div className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-2">
        {EXAMPLE_TASKS.map((t) => (
          <button
            key={t}
            onClick={() => onQuickAdd(t)}
            className="rounded-full border border-white/60 bg-white/60 px-3.5 py-1.5 text-xs text-foreground/80 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/80 active:translate-y-0 active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          >
            + {t}
          </button>
        ))}
      </div>
    </div>
  );
}
