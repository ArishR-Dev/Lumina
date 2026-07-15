import { memo, useCallback, useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import {
  BUILTIN_MOODS,
  customToMood,
  resolveMood,
  type CustomMood,
  type Mood,
} from "@/lib/lumina-moods";
import { useLumina } from "@/lib/lumina-store";
import { cn } from "@/lib/utils";
import { MoodEditorDialog } from "./MoodEditorDialog";

type Props = {
  value: string | undefined | null;
  onChange: (moodId: string) => void;
  /** Cap the list; when omitted, all built-in + custom moods are shown. */
  limit?: number;
  className?: string;
  /** Optional heading rendered above the picker. */
  label?: string;
  compact?: boolean;
};

/**
 * Premium mood picker.
 *
 * - Desktop: wraps into a soft grid of cards.
 * - Mobile: horizontal snap carousel with hidden scrollbar.
 * - Cards are memoized so typing in a journal does not re-render every mood.
 * - Custom moods live at the end of the list and can be edited or deleted
 *   from a small pencil action that appears on selection.
 */
export function MoodPicker({ value, onChange, limit, className, label, compact }: Props) {
  const customMoods = useLumina((s) => s.customMoods);
  const [editing, setEditing] = useState<CustomMood | null>(null);
  const [creating, setCreating] = useState(false);

  const moods = useMemo<Mood[]>(() => {
    const combined = [...BUILTIN_MOODS, ...customMoods.map(customToMood)];
    return typeof limit === "number" ? combined.slice(0, limit) : combined;
  }, [customMoods, limit]);

  const selectedMood = resolveMood(value, customMoods);
  const selectedId = selectedMood?.id ?? null;

  const handleSelect = useCallback((id: string) => onChange(id), [onChange]);
  const handleEdit = useCallback((c: CustomMood) => setEditing(c), []);

  return (
    <div className={className}>
      {label && (
        <div className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          {label}
        </div>
      )}

      {/* Mobile: horizontal snap carousel. Desktop: wrapping grid. */}
      <div
        className={cn(
          "mood-picker-scroll -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-1 pb-2",
          "md:mx-0 md:flex-wrap md:overflow-visible md:pb-0",
        )}
        role="radiogroup"
        aria-label="Mood"
      >
        {moods.map((m) => (
          <MoodCard
            key={m.id}
            mood={m}
            selected={m.id === selectedId}
            onSelect={handleSelect}
            onEdit={m.custom ? () => {
              const c = customMoods.find((x) => x.id === m.id);
              if (c) handleEdit(c);
            } : undefined}
            compact={compact}
          />
        ))}

        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="Create custom mood"
          className={cn(
            "mood-card group relative flex shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-white/60 bg-white/40 px-4 text-center transition-all",
            "hover:-translate-y-0.5 hover:border-primary/60 hover:bg-white/60 hover:shadow-[0_10px_30px_-14px_color-mix(in_oklab,var(--primary)_50%,transparent)]",
            "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
            compact ? "h-16 w-16" : "h-24 w-24 md:w-28",
          )}
        >
          <Plus className={cn("text-muted-foreground group-hover:text-primary transition", compact ? "h-4 w-4" : "h-5 w-5")} />
          {!compact && (
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-primary">
              Create
            </span>
          )}
        </button>
      </div>

      <MoodEditorDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(m) => onChange(m.id)}
      />
      <MoodEditorDialog
        open={editing !== null}
        editing={editing ?? undefined}
        onOpenChange={(o) => !o && setEditing(null)}
        onDeleted={() => {
          // If the deleted mood was the selected value, keep the value —
          // resolveMood() will still render the historical emoji.
          setEditing(null);
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Individual mood card
// -----------------------------------------------------------------------------

type CardProps = {
  mood: Mood;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit?: () => void;
  compact?: boolean;
};

const MoodCard = memo(function MoodCard({ mood, selected, onSelect, onEdit, compact }: CardProps) {
  const { emoji, title, subtitle, color } = mood;

  const style: React.CSSProperties = selected
    ? {
        // Softly tint ONLY the selected card.
        borderColor: color.base,
        boxShadow: `0 0 0 1px ${color.base}55, 0 12px 28px -12px ${color.base}66`,
        backgroundColor: `color-mix(in oklab, ${color.base} 12%, transparent)`,
      }
    : {};

  return (
    <div
      className={cn(
        "relative shrink-0 snap-start",
        compact ? "h-16 w-16" : "h-24 w-24 md:w-32",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(mood.id)}
        role="radio"
        aria-checked={selected}
        aria-label={title + (subtitle ? " — " + subtitle : "")}
        style={style}
        className={cn(
          "mood-card group relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/60 bg-white/55 text-center transition-all duration-200",
          "hover:-translate-y-[3px] hover:border-white/80 hover:bg-white/75 hover:shadow-[0_12px_28px_-14px_rgba(0,0,0,0.25)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
          selected && "mood-selected scale-[1.02]",
        )}
      >
        <span className={cn("leading-none", compact ? "text-2xl" : "text-3xl")} aria-hidden>
          {emoji}
        </span>
        {!compact && (
          <>
            <span className="mt-1 text-[11px] font-semibold leading-tight text-foreground">
              {title}
            </span>
            {subtitle && (
              <span className="line-clamp-1 px-1.5 text-[9px] leading-tight text-muted-foreground">
                {subtitle}
              </span>
            )}
          </>
        )}
        {selected && (
          <span
            aria-hidden
            className="mood-sweep pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
          />
        )}
      </button>
      {selected && onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`Edit ${title}`}
          className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full border border-white/70 bg-white text-foreground/70 shadow-sm hover:text-primary dark:border-white/20 dark:bg-white/10"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
});
