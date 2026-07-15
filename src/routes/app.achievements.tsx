import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { useLumina } from "@/lib/lumina-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/achievements")({ component: AchievementsPage });

type Badge = {
  id: string;
  emoji: string;
  name: string;
  hint: string;
  progress: number; // 0..1
  value: number;
  goal: number;
  earned: boolean;
};

function computeStreak(dates: string[]) {
  const set = new Set(dates);
  let s = 0;
  const d = new Date();
  while (set.has(d.toISOString().slice(0, 10))) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

function AchievementsPage() {
  const notes = useLumina((s) => s.notes);
  const journal = useLumina((s) => s.journal);
  const letters = useLumina((s) => s.letters);
  const memories = useLumina((s) => s.memories);
  const tasks = useLumina((s) => s.tasks);
  const habits = useLumina((s) => s.habits);
  const streak = computeStreak(journal.map((j) => j.date));
  const habitDays = habits.reduce((a, h) => a + h.days.length, 0);
  const doneTasks = tasks.filter((t) => t.done).length;

  const specs: [string, string, string, number, number][] = [
    ["note-1", "📝", "First Note", 1, notes.length],
    ["note-10", "✨", "Ten Little Pages", 10, notes.length],
    ["note-100", "📚", "A Whole Book", 100, notes.length],
    ["journal-1", "🌸", "First Journal", 1, journal.length],
    ["journal-100", "🌺", "A Hundred Days", 100, journal.length],
    ["letter-1", "💌", "First Letter", 1, letters.length],
    ["memory-1", "📷", "First Memory", 1, memories.length],
    ["streak-7", "🔥", "A Week in a Row", 7, streak],
    ["streak-30", "🌟", "A Kind Month", 30, streak],
    ["streak-365", "🏆", "A Whole Year", 365, streak],
    ["tasks-100", "✅", "Hundred Small Wins", 100, doneTasks],
    ["habits-50", "🌿", "Fifty Habit Days", 50, habitDays],
  ];

  const badges: Badge[] = specs.map(([id, emoji, name, goal, value]) => ({
    id,
    emoji,
    name,
    goal,
    value,
    progress: Math.min(1, value / goal),
    earned: value >= goal,
    hint: hintFor(id),
  }));

  const earned = badges.filter((b) => b.earned).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="little proofs of showing up"
        title="Achievements"
        subtitle={`${earned} of ${badges.length} earned · quietly, kindly, in your own time.`}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((b, i) => (
          <motion.div
            key={b.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <GlassCard className={cn("flex items-center gap-4", !b.earned && "opacity-70")}
            >
              <div
                className={cn(
                  "grid h-16 w-16 shrink-0 place-items-center rounded-full text-3xl shadow-inner",
                  b.earned
                    ? "bg-gradient-to-br from-[oklch(0.92_0.12_340)] to-[oklch(0.86_0.1_290)]"
                    : "bg-white/50 grayscale dark:bg-white/5",
                )}
                aria-hidden
              >
                {b.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-display text-lg">{b.name}</div>
                  {b.earned && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                      Earned
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{b.hint}</div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/60 dark:bg-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${b.progress * 100}%` }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))]"
                  />
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {Math.min(b.value, b.goal)} / {b.goal}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function hintFor(id: string): string {
  switch (id) {
    case "note-1": return "Write your very first note.";
    case "note-10": return "Ten little pages of you.";
    case "note-100": return "A hundred pages — a whole book.";
    case "journal-1": return "Every day deserves a page.";
    case "journal-100": return "A hundred journal entries.";
    case "letter-1": return "Send words that last.";
    case "memory-1": return "Keep a little moment.";
    case "streak-7": return "Write on seven days in a row.";
    case "streak-30": return "A kind, steady month.";
    case "streak-365": return "A whole year of showing up.";
    case "tasks-100": return "Complete a hundred small tasks.";
    case "habits-50": return "Fifty habit check-ins together.";
    default: return "";
  }
}