import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { MoodPicker } from "@/components/lumina/MoodPicker";
import { useLumina } from "@/lib/lumina-store";
import { Check, Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/journal")({
  component: JournalPage,
  validateSearch: (s: Record<string, unknown>) => ({
    date: typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : undefined,
  }),
});

const prompts = [
  "What made you smile today, even a little?",
  "One thing you're proud of, even quietly?",
  "Something you want to remember about today.",
];

const PLACEHOLDER_RE = /^(RACE|STRESS|QA)_[A-Z]+_\d+$|^(Gratitude|Reflection|Highlight)\s+\d+$/i;

function meaningful(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  if (PLACEHOLDER_RE.test(t)) return null;
  return t;
}

// Kept for import parity with prior file; downstream utilities may still call
// this indirectly through the store — no behavioural change.
export function _previewOf(j: { gratitude?: string; reflection?: string; highlight?: string }): string | null {
  const first =
    meaningful(j.gratitude) ?? meaningful(j.reflection) ?? meaningful(j.highlight);
  if (!first) return null;
  return first.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null;
}

type Entry = { mood: string; gratitude: string; reflection: string; highlight: string };
const EMPTY: Entry = { mood: "", gratitude: "", reflection: "", highlight: "" };

const MAX_CHARS = 2000;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type SaveState = "idle" | "saving" | "saved";

function JournalPage() {
  const journal = useLumina((s) => s.journal);
  const saveJournal = useLumina((s) => s.saveJournal);
  const search = Route.useSearch();

  const [date, setDate] = useState<string>(() => search.date ?? todayISO());
  useEffect(() => {
    if (search.date && search.date !== date) setDate(search.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.date]);
  const [entry, setEntry] = useState<Entry>(EMPTY);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedRef = useRef<Entry>(EMPTY);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const e = journal.find((j) => j.date === date);
    const loaded: Entry = {
      mood: e?.mood ?? "",
      gratitude: e?.gratitude ?? "",
      reflection: e?.reflection ?? "",
      highlight: e?.highlight ?? "",
    };
    setEntry(loaded);
    savedRef.current = loaded;
    setSaveState("idle");
  }, [date, journal]);

  useEffect(() => {
    const dirty =
      entry.mood !== savedRef.current.mood ||
      entry.gratitude !== savedRef.current.gratitude ||
      entry.reflection !== savedRef.current.reflection ||
      entry.highlight !== savedRef.current.highlight;
    if (!dirty) return;
    const anything =
      entry.mood.trim() ||
      entry.gratitude.trim() ||
      entry.reflection.trim() ||
      entry.highlight.trim();
    if (!anything) return;

    setSaveState("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      saveJournal({ date, ...entry });
      savedRef.current = entry;
      setSaveState("saved");
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
      savedFlashTimer.current = setTimeout(() => setSaveState("idle"), 1600);
    }, 700);
    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [entry, date, saveJournal]);

  const setMood = useCallback((m: string) => setEntry((e) => ({ ...e, mood: m })), []);

  const totalChars = useMemo(
    () => entry.gratitude.length + entry.reflection.length + entry.highlight.length,
    [entry.gratitude, entry.reflection, entry.highlight],
  );

  const onSaveNow = () => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    saveJournal({ date, ...entry });
    savedRef.current = entry;
    setSaveState("saved");
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    savedFlashTimer.current = setTimeout(() => setSaveState("idle"), 1600);
    toast.success("Journal saved", { description: "Your page is tucked away safely." });
  };

  const isToday = date === todayISO();

  return (
    <div className="pb-32">
      <PageHeader
        eyebrow="your daily page"
        title="Journal"
        subtitle="One kind page for each day."
        actions={<SaveIndicator state={saveState} />}
      />
      <div className="grid grid-cols-1 gap-6">
        <GlassCard className="!p-6 sm:!p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(ev) => setDate(ev.target.value)}
              className="h-11 rounded-2xl border border-white/60 bg-white/60 px-4 text-sm outline-none transition focus:border-primary/50 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)] dark:border-white/10 dark:bg-white/5"
            />
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground sm:hidden">
              <SaveIndicator state={saveState} />
            </div>
          </div>

          <div className="mt-6">
            <MoodPicker
              label="How are you feeling?"
              value={entry.mood}
              onChange={setMood}
            />
          </div>

          <Section
            label="Gratitude"
            prompt={prompts[0]}
            count={entry.gratitude.length}
          >
            <textarea
              value={entry.gratitude}
              maxLength={MAX_CHARS}
              onChange={(e) => setEntry((v) => ({ ...v, gratitude: e.target.value }))}
              placeholder="Start with a small thank-you…"
              className="mt-3 min-h-[110px] w-full resize-none rounded-2xl border border-white/50 bg-white/50 p-4 text-[15px] leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)] dark:border-white/10 dark:bg-white/5"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
          </Section>
          <Section
            label="Reflection"
            prompt={prompts[1]}
            count={entry.reflection.length}
          >
            <textarea
              value={entry.reflection}
              maxLength={MAX_CHARS}
              onChange={(e) => setEntry((v) => ({ ...v, reflection: e.target.value }))}
              placeholder="Let the day settle here…"
              className="mt-3 min-h-[150px] w-full resize-none rounded-2xl border border-white/50 bg-white/50 p-4 text-[15px] leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)] dark:border-white/10 dark:bg-white/5"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
          </Section>
          <Section
            label="Highlight"
            prompt={prompts[2]}
            count={entry.highlight.length}
          >
            <textarea
              value={entry.highlight}
              maxLength={MAX_CHARS}
              onChange={(e) => setEntry((v) => ({ ...v, highlight: e.target.value }))}
              placeholder="A moment worth keeping…"
              className="mt-3 min-h-[110px] w-full resize-none rounded-2xl border border-white/50 bg-white/50 p-4 text-[15px] leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)] dark:border-white/10 dark:bg-white/5"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
          </Section>

          <div className="mt-7 flex items-center justify-between border-t border-white/40 pt-5 text-[11px] uppercase tracking-widest text-muted-foreground dark:border-white/10">
            <span>{totalChars.toLocaleString()} characters today</span>
            <SaveIndicator state={saveState} />
          </div>
        </GlassCard>
      </div>

      {/* Sticky save — always reachable on mobile without hunting for it */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-30 flex justify-center px-4 sm:bottom-8">
        <button
          onClick={onSaveNow}
          className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] px-6 py-3 text-sm font-medium text-white shadow-[0_14px_36px_-14px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0"
        >
          <Heart className="h-4 w-4" /> Save {isToday ? "today" : "entry"}
        </button>
      </div>
    </div>
  );
}


function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-opacity"
      aria-live="polite"
    >
      {state === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-primary" /> saving…
        </>
      ) : state === "saved" ? (
        <>
          <Check className="h-3 w-3 text-primary" /> saved
        </>
      ) : (
        <span className="opacity-60">autosaves as you write</span>
      )}
    </span>
  );
}

function Section({
  label, prompt, count, children,
}: {
  label: string;
  prompt: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{label}</div>
        <span className="text-[10px] tabular-nums text-muted-foreground/70">{count}/{MAX_CHARS}</span>
      </div>
      <div className="mt-1.5 font-hand text-xl leading-snug text-[oklch(0.55_0.12_340)]">{prompt}</div>
      {children}
    </div>
  );
}
