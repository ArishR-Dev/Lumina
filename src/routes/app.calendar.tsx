import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, BookOpen, Pencil, PenLine } from "lucide-react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { MoodBadge } from "@/components/lumina/MoodBadge";
import { useLumina, type JournalEntry } from "@/lib/lumina-store";
import { resolveMood } from "@/lib/lumina-moods";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";



export const Route = createFileRoute("/app/calendar")({ component: CalendarPage });

const PLACEHOLDER_RE = /^(RACE|STRESS|QA)_[A-Z]+_\d+$|^(Gratitude|Reflection|Highlight)\s+\d+$/i;
function meaningful(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t || PLACEHOLDER_RE.test(t)) return null;
  return t;
}

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatLongDate(key: string) {
  return new Date(key + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function CalendarPage() {
  const journal = useLumina((s) => s.journal);
  const moods = useLumina((s) => s.moods);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const gridRef = useRef<HTMLDivElement>(null);

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthName = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const todayKey = toKey(new Date());

  // Index moods & journals by date for O(1) lookup and stable memo deps.
  const journalByDate = useMemo(() => {
    const map = new Map<string, JournalEntry>();
    for (const j of journal) map.set(j.date, j);
    return map;
  }, [journal]);
  const moodByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const x of moods) map.set(x.date, x.mood);
    for (const j of journal) if (j.mood && !map.has(j.date)) map.set(j.date, j.mood);
    return map;
  }, [moods, journal]);




  const cells = useMemo(() => {
    const arr: (number | null)[] = Array(firstDow).fill(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(i);
    return arr;
  }, [firstDow, daysInMonth]);

  const keyFor = useCallback((d: number) => toKey(new Date(y, m, d)), [y, m]);

  const openPreview = useCallback((key: string) => {
    setSelected(key);
    setPreviewKey(key);
  }, []);
  const closePreview = useCallback(() => setPreviewKey(null), []);


  // Keyboard: Enter opens preview, Esc closes, arrows navigate the selected day.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (previewKey) {
          e.preventDefault();
          closePreview();
        }
        return;
      }
      if (previewKey) return;
      if (!selected) return;
      if (e.key === "Enter") {
        e.preventDefault();
        openPreview(selected);
        return;
      }
      const map: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
      };
      if (e.key in map) {
        e.preventDefault();
        const cur = new Date(selected + "T00:00:00");
        cur.setDate(cur.getDate() + map[e.key]);
        const nk = toKey(cur);
        setSelected(nk);
        if (cur.getMonth() !== m || cur.getFullYear() !== y) {
          setCursor(new Date(cur.getFullYear(), cur.getMonth(), 1));
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewKey, selected, m, y, openPreview, closePreview]);

  const previewEntry = previewKey ? journalByDate.get(previewKey) ?? null : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="the shape of your days"
        title="Memory Calendar"
        subtitle="Double-tap any day to revisit what you wrote."
      />
      <GlassCard>
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setCursor(new Date(y, m - 1, 1))}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/60 text-base dark:bg-white/5"
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="font-display text-2xl">{monthName}</div>
          <button
            onClick={() => setCursor(new Date(y, m + 1, 1))}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/60 text-base dark:bg-white/5"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
        <div ref={gridRef} className="mt-2 grid grid-cols-7 gap-2">
          {cells.map((c, i) => {
            if (!c) return <div key={`e-${i}`} className="aspect-square opacity-0" />;
            const key = keyFor(c);
            return (
              <CalendarCell
                key={key}
                day={c}
                dateKey={key}
                isToday={key === todayKey}
                isSelected={key === selected}
                hasEntry={journalByDate.has(key)}
                mood={moodByDate.get(key)}
                onSelect={setSelected}
                onOpen={openPreview}
              />

            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Single tap: select</span>
          <span>Double tap / double-click: open memory</span>
          <span className="hidden md:inline">Enter: open • Esc: close • Arrows: navigate</span>
        </div>
      </GlassCard>

      <AnimatePresence>
        {previewKey && (
          <JournalPreview
            key={previewKey}
            dateKey={previewKey}
            entry={previewEntry}
            isMobile={isMobile}
            onClose={closePreview}
          />
        )}
      </AnimatePresence>

    </div>
  );
}

type CellProps = {
  day: number;
  dateKey: string;
  isToday: boolean;
  isSelected: boolean;
  hasEntry: boolean;
  mood: string | undefined;
  onSelect: (k: string) => void;
  onOpen: (k: string) => void;
};

const CalendarCell = memo(function CalendarCell({
  day,
  dateKey,
  isToday,
  isSelected,
  hasEntry,
  mood,
  onSelect,
  onOpen,
}: CellProps) {


  const lastTapRef = useRef(0);

  const handleClick = useCallback(() => {
    // Detect double-tap on touch devices where dblclick isn't reliable.
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      if (hasEntry) onOpen(dateKey);
      else onSelect(dateKey);
      return;
    }
    lastTapRef.current = now;
    onSelect(dateKey);
  }, [dateKey, hasEntry, onOpen, onSelect]);

  const handleDoubleClick = useCallback(() => {
    lastTapRef.current = 0;
    if (hasEntry) onOpen(dateKey);
  }, [dateKey, hasEntry, onOpen]);

  return (
    <button
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      aria-label={formatLongDate(dateKey) + (isToday ? " (today)" : "") + (hasEntry ? ", has journal entry" : "")}
      aria-current={isToday ? "date" : undefined}
      aria-pressed={isSelected}
      className={cn(
        "relative grid aspect-square place-items-center rounded-2xl text-sm transition-all duration-200 select-none",
        "md:hover:-translate-y-0.5 md:hover:shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--primary)_35%,transparent)]",
        "active:scale-[0.97]",
        !isToday && !isSelected && "bg-white/60 dark:bg-white/5",
        isSelected &&
          !isToday &&
          "scale-[1.02] border border-white/80 bg-white/70 shadow-sm ring-1 ring-primary/40 lumina-today dark:border-white/20 dark:bg-white/10",
        isToday &&
          "lumina-today scale-[1.06] bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] text-primary-foreground",
        isToday && isSelected && "ring-2 ring-white/80",
        hasEntry &&
          !isToday &&
          "shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_20%,transparent),0_6px_20px_-10px_color-mix(in_oklab,var(--primary)_40%,transparent)]",
      )}
    >
      <div className="text-center leading-tight">
        <div className={cn("font-medium", isToday && "text-white drop-shadow-sm")}>{day}</div>
        {mood && <MoodBadge value={mood} size="md" className="leading-none" />}
      </div>
      {hasEntry && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
            isToday ? "bg-white/90" : "bg-primary/70",
          )}
        />
      )}



    </button>
  );
});

// -----------------------------------------------------------------------------
// Preview modal / bottom sheet
// -----------------------------------------------------------------------------

type PreviewProps = {
  dateKey: string;
  entry: JournalEntry | null;
  isMobile: boolean;
  onClose: () => void;
};

function JournalPreview({ dateKey, entry, isMobile, onClose }: PreviewProps) {


  const navigate = useNavigate();
  const goto = (edit: boolean) => {
    onClose();
    // If we have a saved entry, open the dedicated detail route (deep-linkable,
    // browser back-friendly). If not, fall back to the list route with the
    // date pre-filled so the user can begin writing.
    if (entry && !edit) {
      navigate({ to: "/app/journal/$id", params: { id: entry.id } });
      return;
    }
    navigate({
      to: "/app/journal",
      search: { date: dateKey, ...(edit ? { edit: 1 } : {}) } as never,
    });
  };

  const long = formatLongDate(dateKey);
  // entry.mood is resolved below via resolveMood()
  const gratitude = meaningful(entry?.gratitude);
  const reflection = meaningful(entry?.reflection);
  const highlight = meaningful(entry?.highlight);
  const timestamp = entry ? new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;

  const customMoods = useLumina((s) => s.customMoods);
  const resolvedMood = resolveMood(entry?.mood, customMoods);

  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-6xl leading-none" aria-hidden>{resolvedMood?.emoji ?? "📖"}</div>
          {resolvedMood && (
            <div className="mt-2 text-sm font-medium text-foreground/80">{resolvedMood.title}</div>
          )}
          <div className="mt-3 font-display text-2xl md:text-3xl">{long}</div>
          {timestamp && (
            <div className="mt-1 text-xs text-muted-foreground">saved at {timestamp}</div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close preview"
          className="rounded-full bg-white/60 p-2 text-foreground/70 transition hover:bg-white/80 dark:bg-white/10 dark:hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-6 space-y-5 max-h-[55vh] overflow-y-auto pr-1">
        {!entry ? (
          <EmptyState dateKey={dateKey} onWrite={() => goto(true)} />
        ) : (
          <>
            {gratitude && <Section label="Gratitude" body={gratitude} />}
            {reflection && <Section label="Reflection" body={reflection} />}
            {highlight && <Section label="Highlight" body={highlight} />}
            {!gratitude && !reflection && !highlight && (
              <EmptyState dateKey={dateKey} onWrite={() => goto(true)} />
            )}
          </>
        )}


      </div>


      {entry && (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-white/40 pt-4 dark:border-white/10">
          <button
            onClick={onClose}
            className="rounded-full bg-white/60 px-4 py-2 text-sm dark:bg-white/10"
          >
            Close
          </button>
          <button
            onClick={() => goto(true)}
            className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm shadow-sm hover:bg-white/90 dark:bg-white/10 dark:hover:bg-white/20"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            onClick={() => goto(false)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] px-4 py-2 text-sm text-primary-foreground shadow-sm"
          >
            <BookOpen className="h-4 w-4" /> Continue writing
          </button>
        </div>
      )}
    </>
  );

  // Backdrop
  const backdrop = (
    <motion.div
      key="backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-40 bg-black/30 backdrop-blur-md"
      aria-hidden
    />
  );

  if (isMobile) {
    return (
      <>
        {backdrop}
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Journal for ${long}`}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 120 || info.velocity.y > 500) onClose();
          }}
          className="glass fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-hidden rounded-t-3xl border-t border-white/50 p-6 shadow-2xl dark:border-white/10"
        >
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-foreground/20" aria-hidden />
          {body}
        </motion.div>
      </>
    );
  }

  return (
    <>
      {backdrop}
      <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Journal for ${long}`}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="glass w-full max-w-xl rounded-3xl border border-white/50 p-8 shadow-2xl dark:border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          {body}
        </motion.div>
      </div>
    </>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <p className="mt-1 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-foreground/90">
        {body}
      </p>
    </section>
  );
}

function EmptyState({ dateKey, onWrite }: { dateKey: string; onWrite: () => void }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/40 p-6 text-center dark:border-white/10 dark:bg-white/5">
      <div className="text-4xl">🪶</div>
      <p className="mt-3 font-serif text-base text-foreground/80">
        No journal was written on {formatLongDate(dateKey)}.
      </p>
      <button
        onClick={onWrite}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] px-4 py-2 text-sm text-primary-foreground shadow-sm"
      >
        <PenLine className="h-4 w-4" /> Write for this day
      </button>
    </div>
  );
}
