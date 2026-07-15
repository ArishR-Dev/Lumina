/* ------------------------------------------------------------------ *
 * Lumina Mood Registry
 *
 * Single source of truth for every mood in the app.  Journal / calendar /
 * dashboard / timeline all resolve mood values through `resolveMood()`
 * so that changing this file changes the entire UI in one place.
 *
 * Storage contract:
 *   - New writes store a mood *id* (e.g. "happy", or "c_abc123" for custom).
 *   - Legacy writes stored the raw emoji ("😊").  resolveMood() accepts
 *     either — if the value is not a known id, we look up by emoji, and
 *     fall back to displaying it as a bare emoji (with title "Mood") so
 *     historical journals never break.
 * ------------------------------------------------------------------ */

export type MoodColor = {
  /** Base tint used for chip backgrounds & dots. */
  base: string;
  /** Softer tint for chip bg on selected state. */
  soft: string;
  /** Text/border accent. */
  accent: string;
};

export type Mood = {
  id: string;
  emoji: string;
  title: string;
  subtitle?: string;
  color: MoodColor;
  /** True for user-created moods stored in the persistence layer. */
  custom?: boolean;
};

// -----------------------------------------------------------------------------
// Named colour tokens.  Kept as literal hex/oklch strings so components can pass
// them into inline styles (design-system tokens can't parameterise a hex).
// -----------------------------------------------------------------------------

export const MOOD_COLORS = {
  indigo:   { base: "#6366f1", soft: "#e0e7ff", accent: "#4338ca" },
  ocean:    { base: "#0ea5e9", soft: "#dbeafe", accent: "#0369a1" },
  slate:    { base: "#64748b", soft: "#e2e8f0", accent: "#334155" },
  gray:     { base: "#9ca3af", soft: "#e5e7eb", accent: "#4b5563" },
  mint:     { base: "#10b981", soft: "#d1fae5", accent: "#047857" },
  sky:      { base: "#38bdf8", soft: "#e0f2fe", accent: "#0284c7" },
  amber:    { base: "#f59e0b", soft: "#fef3c7", accent: "#b45309" },
  rose:     { base: "#f43f5e", soft: "#ffe4e6", accent: "#be123c" },
  lavender: { base: "#a78bfa", soft: "#ede9fe", accent: "#6d28d9" },
  midnight: { base: "#1e293b", soft: "#cbd5e1", accent: "#0f172a" },
  orange:   { base: "#f97316", soft: "#ffedd5", accent: "#c2410c" },
  gold:     { base: "#eab308", soft: "#fef9c3", accent: "#a16207" },
  crimson:  { base: "#dc2626", soft: "#fee2e2", accent: "#991b1b" },
  white:    { base: "#f8fafc", soft: "#f1f5f9", accent: "#94a3b8" },
  navy:     { base: "#1e40af", soft: "#dbeafe", accent: "#1e3a8a" },
  sapphire: { base: "#2563eb", soft: "#dbeafe", accent: "#1d4ed8" },
} as const satisfies Record<string, MoodColor>;

export type MoodColorName = keyof typeof MOOD_COLORS;

export const MOOD_COLOR_ORDER: MoodColorName[] = [
  "indigo","ocean","slate","gray","mint","sky","amber","rose",
  "lavender","midnight","orange","gold","crimson","white","navy","sapphire",
];

// -----------------------------------------------------------------------------
// Built-in mood catalog.  Order matters — this is the display order in every
// mood picker in the app.
// -----------------------------------------------------------------------------

export const BUILTIN_MOODS: Mood[] = [
  { id: "devastated", emoji: "😭", title: "Devastated", subtitle: "Overwhelmed today.", color: MOOD_COLORS.indigo   },
  { id: "sad",        emoji: "😢", title: "Sad",        subtitle: "Heavy on the heart.", color: MOOD_COLORS.ocean    },
  { id: "low",        emoji: "😔", title: "Low",        subtitle: "Taking things slowly.", color: MOOD_COLORS.slate  },
  { id: "neutral",    emoji: "😐", title: "Neutral",    subtitle: "Somewhere in between.", color: MOOD_COLORS.gray   },
  { id: "calm",       emoji: "🙂", title: "Calm",       subtitle: "Softly settled.", color: MOOD_COLORS.mint         },
  { id: "happy",      emoji: "😊", title: "Happy",      subtitle: "Feeling light today.", color: MOOD_COLORS.sky     },
  { id: "excited",    emoji: "😁", title: "Excited",    subtitle: "Something good is here.", color: MOOD_COLORS.amber },
  { id: "loved",      emoji: "🥰", title: "Loved",      subtitle: "Held and cared for.", color: MOOD_COLORS.rose     },
  { id: "peaceful",   emoji: "😌", title: "Peaceful",   subtitle: "Quietly at ease.", color: MOOD_COLORS.lavender    },
  { id: "sleepy",     emoji: "😴", title: "Sleepy",     subtitle: "Gentle and tired.", color: MOOD_COLORS.midnight   },
  { id: "motivated",  emoji: "😤", title: "Motivated",  subtitle: "Ready to move.", color: MOOD_COLORS.orange        },
  { id: "inspired",   emoji: "🤩", title: "Inspired",   subtitle: "The world feels wide.", color: MOOD_COLORS.gold   },

  // Special moods
  { id: "fired_up",  emoji: "🔥", title: "Fired Up",     subtitle: "All engines on.", color: MOOD_COLORS.crimson  },
  { id: "magical",   emoji: "✨", title: "Magical Day",  subtitle: "A little bit of wonder.", color: MOOD_COLORS.white },
  { id: "quiet",     emoji: "🌙", title: "Quiet Night",  subtitle: "Winding gently down.", color: MOOD_COLORS.navy },
  { id: "productive",emoji: "⚡", title: "Productive",   subtitle: "In flow, in motion.", color: MOOD_COLORS.amber },
  { id: "grateful",  emoji: "💙", title: "Grateful",     subtitle: "Counting the good.", color: MOOD_COLORS.sapphire },
  { id: "rainy",     emoji: "🌧️", title: "Rainy Mood",   subtitle: "Soft and reflective.", color: MOOD_COLORS.slate },
];

const BUILTIN_BY_ID = new Map(BUILTIN_MOODS.map((m) => [m.id, m]));
const BUILTIN_BY_EMOJI = new Map(BUILTIN_MOODS.map((m) => [m.emoji, m]));

// -----------------------------------------------------------------------------
// Custom moods (shape lives in the store).
// -----------------------------------------------------------------------------

export type CustomMood = {
  id: string;              // e.g. "c_abcd1234"
  emoji: string;
  title: string;
  subtitle?: string;
  colorName: MoodColorName;
  createdAt: number;
  updatedAt: number;
};

export function customToMood(c: CustomMood): Mood {
  return {
    id: c.id,
    emoji: c.emoji,
    title: c.title,
    subtitle: c.subtitle,
    color: MOOD_COLORS[c.colorName] ?? MOOD_COLORS.slate,
    custom: true,
  };
}

// -----------------------------------------------------------------------------
// Resolution
// -----------------------------------------------------------------------------

/**
 * Resolve a stored mood value (id, custom id, or legacy raw emoji) into a
 * full Mood record for display.  Returns null for empty/missing values.
 */
export function resolveMood(
  value: string | undefined | null,
  customMoods: CustomMood[] = [],
): Mood | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;

  const builtin = BUILTIN_BY_ID.get(v);
  if (builtin) return builtin;

  const custom = customMoods.find((c) => c.id === v);
  if (custom) return customToMood(custom);

  // Legacy: raw emoji stored before this system existed.
  const byEmoji = BUILTIN_BY_EMOJI.get(v);
  if (byEmoji) return byEmoji;

  const customByEmoji = customMoods.find((c) => c.emoji === v);
  if (customByEmoji) return customToMood(customByEmoji);

  // Historical unknown emoji — preserve so journals never break.
  return {
    id: v,
    emoji: v,
    title: "Mood",
    color: MOOD_COLORS.slate,
  };
}

export function allMoods(customMoods: CustomMood[] = []): Mood[] {
  return [...BUILTIN_MOODS, ...customMoods.map(customToMood)];
}

/**
 * Given a list of MoodLog / JournalEntry records (anything with `.mood`),
 * return the mood ids ordered by recency of use.
 */
export function recentMoodIds(
  records: { mood?: string; createdAt?: number; date?: string }[],
  limit = 5,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of records) {
    if (!r.mood) continue;
    if (seen.has(r.mood)) continue;
    seen.add(r.mood);
    out.push(r.mood);
    if (out.length >= limit) break;
  }
  return out;
}
