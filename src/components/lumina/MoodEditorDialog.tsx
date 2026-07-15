import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MOOD_COLORS,
  MOOD_COLOR_ORDER,
  type CustomMood,
  type MoodColorName,
} from "@/lib/lumina-moods";
import { useLumina } from "@/lib/lumina-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const QUICK_EMOJIS = [
  "🦋","🌸","🌊","🌈","🌻","🌱","🌟","🌙","☀️","☁️","⛅","🔥","💧","🍀","🍂","❄️",
  "🎨","🎧","📚","☕","🍵","🍩","🍰","🎂","🎮","🎬","🎭","🎯","🏋️","🧘","🚗","✈️",
  "🐈","🐕","🐛","🦊","🐳","🕊️","💪","🧠","👀","💤","💫","✨","💖","💜","💛","💙",
];

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When provided, dialog is in edit mode for this mood. */
  editing?: CustomMood;
  onSaved?: (mood: CustomMood) => void;
  onDeleted?: () => void;
};

export function MoodEditorDialog({ open, onOpenChange, editing, onSaved, onDeleted }: Props) {
  const addCustomMood = useLumina((s) => s.addCustomMood);
  const updateCustomMood = useLumina((s) => s.updateCustomMood);
  const deleteCustomMood = useLumina((s) => s.deleteCustomMood);
  const existing = useLumina((s) => s.customMoods);

  const [emoji, setEmoji] = useState(editing?.emoji ?? "🦋");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [subtitle, setSubtitle] = useState(editing?.subtitle ?? "");
  const [colorName, setColorName] = useState<MoodColorName>(editing?.colorName ?? "sky");

  // Reset form on open / when editing target changes.
  useEffect(() => {
    if (!open) return;
    setEmoji(editing?.emoji ?? "🦋");
    setTitle(editing?.title ?? "");
    setSubtitle(editing?.subtitle ?? "");
    setColorName(editing?.colorName ?? "sky");
  }, [open, editing]);

  const isEdit = !!editing;

  const nameError = useMemo(() => {
    const t = title.trim();
    if (!t) return null;
    if (t.length > 24) return "Keep it under 24 characters.";
    const clash = existing.find(
      (c) => c.title.toLowerCase() === t.toLowerCase() && c.id !== editing?.id,
    );
    if (clash) return "A mood with this name already exists.";
    return null;
  }, [title, existing, editing]);

  const canSave = emoji.trim().length > 0 && title.trim().length > 0 && !nameError;

  function save() {
    if (!canSave) return;
    if (isEdit && editing) {
      updateCustomMood(editing.id, { emoji: emoji.trim(), title: title.trim(), subtitle: subtitle.trim() || undefined, colorName });
      const merged: CustomMood = { ...editing, emoji: emoji.trim(), title: title.trim(), subtitle: subtitle.trim() || undefined, colorName, updatedAt: Date.now() };
      onSaved?.(merged);
      toast.success("Mood updated");
    } else {
      const created = addCustomMood({ emoji: emoji.trim(), title: title.trim(), subtitle: subtitle.trim() || undefined, colorName });
      onSaved?.(created);
      toast.success("Mood created");
    }
    onOpenChange(false);
  }

  function remove() {
    if (!editing) return;
    deleteCustomMood(editing.id);
    onDeleted?.();
    toast.success("Mood removed");
    onOpenChange(false);
  }

  const swatch = MOOD_COLORS[colorName];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-white/60 dark:border-white/10 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isEdit ? "Edit mood" : "Create a mood"}
          </DialogTitle>
          <DialogDescription>
            Make it feel like you. Choose an emoji, a name, and an accent.
          </DialogDescription>
        </DialogHeader>

        {/* Preview */}
        <div
          className="mt-1 flex items-center gap-4 rounded-2xl border p-4"
          style={{
            borderColor: swatch.base + "66",
            backgroundColor: `color-mix(in oklab, ${swatch.base} 12%, transparent)`,
          }}
        >
          <div className="text-5xl leading-none" aria-hidden>{emoji || "🙂"}</div>
          <div className="min-w-0">
            <div className="truncate font-display text-lg">{title || "Your mood"}</div>
            {subtitle && (
              <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>

        {/* Emoji */}
        <div className="mt-2">
          <label className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Emoji
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
              maxLength={4}
              className="w-16 rounded-xl border border-white/60 bg-white/60 px-3 py-2 text-center text-2xl outline-none dark:border-white/10 dark:bg-white/5"
              aria-label="Mood emoji"
            />
            <p className="text-xs text-muted-foreground">
              Type any emoji, or pick one below.
            </p>
          </div>
          <div className="mood-picker-scroll mt-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-xl border border-white/50 bg-white/40 p-2 dark:border-white/10 dark:bg-white/5">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg text-xl transition hover:scale-110 hover:bg-white/70 dark:hover:bg-white/10",
                  emoji === e && "bg-white shadow-sm dark:bg-white/20",
                )}
                aria-label={`Emoji ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="mt-2">
          <label className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Name
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={24}
            placeholder="e.g. Hopeful"
            className="mt-2 w-full rounded-xl border border-white/60 bg-white/60 px-3 py-2 outline-none dark:border-white/10 dark:bg-white/5"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className={nameError ? "text-destructive" : ""}>{nameError ?? "Up to 24 characters."}</span>
            <span>{title.length}/24</span>
          </div>
        </div>

        {/* Description */}
        <div className="mt-2">
          <label className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Short description <span className="opacity-60">(optional)</span>
          </label>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={80}
            placeholder="Feeling like better days are coming."
            className="mt-2 w-full rounded-xl border border-white/60 bg-white/60 px-3 py-2 outline-none dark:border-white/10 dark:bg-white/5"
          />
        </div>

        {/* Accent */}
        <div className="mt-2">
          <label className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Accent
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {MOOD_COLOR_ORDER.map((name) => {
              const c = MOOD_COLORS[name];
              const active = colorName === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setColorName(name)}
                  aria-label={`Accent ${name}`}
                  aria-pressed={active}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full border transition",
                    active ? "scale-110 ring-2 ring-offset-2 ring-offset-background" : "hover:scale-105",
                  )}
                  style={{
                    backgroundColor: c.base,
                    borderColor: active ? c.accent : "rgba(255,255,255,0.5)",
                    // @ts-expect-error CSS var passthrough
                    "--tw-ring-color": c.base,
                  }}
                />
              );
            })}
          </div>
        </div>

        <DialogFooter className="mt-4 flex-wrap gap-2 sm:justify-between">
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={remove}
                className="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-4 py-2 text-sm text-destructive hover:bg-destructive/15"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full bg-white/60 px-4 py-2 text-sm dark:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-40"
            >
              {isEdit ? "Save changes" : "Create mood"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
