import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { useLumina } from "@/lib/lumina-store";
import { notify } from "@/lib/lumina-toasts";
import { Check, Plus } from "lucide-react";

export const Route = createFileRoute("/app/habits")({ component: HabitsPage });

function HabitsPage() {
  const habits = useLumina((s) => s.habits);
  const addHabit = useLumina((s) => s.addHabit);
  const toggleHabitToday = useLumina((s) => s.toggleHabitToday);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🌿");
  const today = new Date().toISOString().slice(0, 10);
  const last14 = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  return (
    <div>
      <PageHeader eyebrow="gentle rituals" title="Habits" subtitle="Little practices that make you feel like you." />
      <GlassCard>
        <form onSubmit={(e) => { e.preventDefault(); const v = name.trim(); if (v) { addHabit(v, emoji); setName(""); notify.created("Habit"); } }} className="flex flex-wrap items-center gap-2">
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-14 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-center text-xl outline-none dark:border-white/10 dark:bg-white/5" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Habit name" className="flex-1 rounded-2xl border border-white/60 bg-white/60 px-4 py-2.5 outline-none dark:border-white/10 dark:bg-white/5" />
          <button type="submit" className="lumina-focus-ring inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] px-5 py-2.5 text-sm font-medium text-white"><Plus className="inline h-4 w-4" /> Add</button>
        </form>
        <div className="mt-6 space-y-3">
          {habits.map((h) => (
            <div key={h.id} className="rounded-2xl bg-white/50 p-4 dark:bg-white/5">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-2xl">{h.emoji}</span>
                <div className="flex-1 font-medium">{h.name}</div>
                <button type="button" onClick={() => { const wasDone = h.days.includes(today); toggleHabitToday(h.id); if (!wasDone) notify.completed(`${h.name}`); else notify.reopened(`${h.name}`); }} className={"lumina-focus-ring rounded-full px-3 py-1 text-xs " + (h.days.includes(today) ? "bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] text-white" : "bg-white/70 text-muted-foreground dark:bg-white/5")}>
                  <Check className="mr-1 inline h-3 w-3" /> today
                </button>
              </div>
              <div className="flex gap-1.5">
                {last14.map((d) => (
                  <div key={d} title={d} className="h-6 w-6 rounded-md" style={{ background: h.days.includes(d) ? "oklch(0.78 0.13 340)" : "oklch(0.95 0.02 320 / .6)" }} />
                ))}
              </div>
            </div>
          ))}
          {habits.length === 0 && <p className="text-center text-sm text-muted-foreground">Add a habit to begin your streak.</p>}
        </div>
      </GlassCard>
    </div>
  );
}