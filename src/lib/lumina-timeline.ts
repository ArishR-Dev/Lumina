import type {
  Capsule,
  Habit,
  JournalEntry,
  Letter,
  Memory,
  MoodLog,
  Note,
  TaskExt,
  Thought,
} from "./lumina-store";
import { resolveMood, type CustomMood } from "./lumina-moods";

export type TimelineEventType =
  | "note"
  | "journal"
  | "thought"
  | "letter"
  | "memory"
  | "task"
  | "task_done"
  | "mood"
  | "capsule_sealed"
  | "capsule_opened"
  | "habit"
  | "achievement";

export type TimelineEvent = {
  id: string;
  at: number;
  type: TimelineEventType;
  title: string;
  preview: string;
  icon: string;
  href: string;
};

export type TimelineData = {
  notes: Note[];
  journal: JournalEntry[];
  thoughts: Thought[];
  letters: Letter[];
  memories: Memory[];
  tasks: TaskExt[];
  moods: MoodLog[];
  customMoods?: CustomMood[];
  capsules?: Capsule[];
  habits?: Habit[];
  /** Ids of achievements the user has unlocked (in order). */
  earnedAchievements?: { id: string; label: string; emoji: string; at: number }[];
};

function detailHref(kind: "notes" | "thoughts" | "letters" | "memories" | "tasks" | "capsules" | "journal", id: string): string {
  return `/app/${kind}/${encodeURIComponent(id)}`;
}

/* ------------------------------------------------------------------ *
 *  Per-slice event builders. Each is pure over its own slice so the
 *  Timeline page can memoize them independently — a note edit will
 *  only rebuild `eventsFromNotes`, everything else is reused as-is.
 *  `buildTimeline` remains for callers that want a single merged list.
 * ------------------------------------------------------------------ */

export function eventsFromNotes(notes: Note[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const n of notes) {
    if (n.trashed) continue;
    out.push({
      id: "note-" + n.id,
      at: n.updatedAt,
      type: "note",
      title: n.title || "Untitled",
      preview: stripHtml(n.content).slice(0, 140),
      icon: "📝",
      href: detailHref("notes", n.id),
    });
  }
  return out;
}

export function eventsFromJournal(journal: JournalEntry[], customMoods: CustomMood[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const j of journal) {
    const rm = resolveMood(j.mood, customMoods);
    const emoji = rm?.emoji ?? "🌸";
    out.push({
      id: "journal-" + j.id,
      at: new Date(j.date + "T09:00:00").getTime(),
      type: "journal",
      title: `${emoji} ${new Date(j.date).toLocaleDateString(undefined, { month: "long", day: "numeric" })}${rm?.title ? " · " + rm.title : ""}`,
      preview: (j.gratitude || j.reflection || j.highlight || "").slice(0, 140),
      icon: emoji,
      href: detailHref("journal", j.id),
    });
  }
  return out;
}

export function eventsFromThoughts(thoughts: Thought[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const t of thoughts) {
    out.push({
      id: "thought-" + t.id,
      at: t.createdAt,
      type: "thought",
      title: "A passing thought",
      preview: t.text.slice(0, 140),
      icon: "💭",
      href: detailHref("thoughts", t.id),
    });
  }
  return out;
}

export function eventsFromLetters(letters: Letter[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const l of letters) {
    out.push({
      id: "letter-" + l.id,
      at: l.createdAt,
      type: "letter",
      title: `To ${l.to || "someone dear"}`,
      preview: l.body.slice(0, 140),
      icon: "💌",
      href: detailHref("letters", l.id),
    });
  }
  return out;
}

export function eventsFromMemories(memories: Memory[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const m of memories) {
    out.push({
      id: "memory-" + m.id,
      at: m.createdAt,
      type: "memory",
      title: m.caption || "A little memory",
      preview: m.album ?? "",
      icon: "📷",
      href: detailHref("memories", m.id),
    });
  }
  return out;
}

export function eventsFromTasks(tasks: TaskExt[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const t of tasks) {
    out.push({
      id: "task-new-" + t.id,
      at: t.createdAt,
      type: "task",
      title: "Task: " + t.text,
      preview: t.due ? `due ${t.due}` : "",
      icon: "◻️",
      href: detailHref("tasks", t.id),
    });
    if (t.done) {
      out.push({
        id: "task-done-" + t.id,
        at: t.createdAt + 1,
        type: "task_done",
        title: "Done: " + t.text,
        preview: "",
        icon: "✅",
        href: detailHref("tasks", t.id),
      });
    }
  }
  return out;
}

export function eventsFromMoods(moods: MoodLog[], customMoods: CustomMood[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const m of moods) {
    const rm = resolveMood(m.mood, customMoods);
    const emoji = rm?.emoji ?? "😊";
    out.push({
      id: "mood-" + m.date,
      at: new Date(m.date + "T12:00:00").getTime(),
      type: "mood",
      title: rm?.title ? `${emoji} ${rm.title}` : `${emoji} feeling`,
      preview: m.note ?? "",
      icon: emoji,
      href: "/app/mood",
    });
  }
  return out;
}

export function eventsFromCapsules(capsules: Capsule[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const c of capsules) {
    out.push({
      id: "capsule-sealed-" + c.id,
      at: c.createdAt,
      type: "capsule_sealed",
      title: `Sealed: ${c.title || "A capsule"}`,
      preview: c.message.slice(0, 140),
      icon: "🎁",
      href: detailHref("capsules", c.id),
    });
    if (c.opened) {
      out.push({
        id: "capsule-opened-" + c.id,
        at: Math.max(c.unlockAt, c.createdAt + 1),
        type: "capsule_opened",
        title: `Opened: ${c.title || "A capsule"}`,
        preview: c.message.slice(0, 140),
        icon: "✨",
        href: detailHref("capsules", c.id),
      });
    }
  }
  return out;
}

export function eventsFromHabits(habits: Habit[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const h of habits) {
    for (const day of h.days) {
      out.push({
        id: `habit-${h.id}-${day}`,
        at: new Date(day + "T18:00:00").getTime(),
        type: "habit",
        title: `${h.emoji || "🌿"} ${h.name}`,
        preview: "kept the streak",
        icon: h.emoji || "🌿",
        href: "/app/habits",
      });
    }
  }
  return out;
}

export function eventsFromAchievements(
  earned: { id: string; label: string; emoji: string; at: number }[],
): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const a of earned) {
    out.push({
      id: "achievement-" + a.id,
      at: a.at,
      type: "achievement",
      title: `${a.emoji} ${a.label}`,
      preview: "a little milestone",
      icon: a.emoji,
      href: "/app/achievements",
    });
  }
  return out;
}

export function mergeTimelineEvents(...groups: TimelineEvent[][]): TimelineEvent[] {
  const merged: TimelineEvent[] = [];
  for (const g of groups) if (g.length) merged.push(...g);
  merged.sort((a, b) => b.at - a.at);
  return merged;
}

export function buildTimeline(data: TimelineData): TimelineEvent[] {
  const customMoods = data.customMoods ?? [];
  return mergeTimelineEvents(
    eventsFromNotes(data.notes),
    eventsFromJournal(data.journal, customMoods),
    eventsFromThoughts(data.thoughts),
    eventsFromLetters(data.letters),
    eventsFromMemories(data.memories),
    eventsFromTasks(data.tasks),
    eventsFromMoods(data.moods, customMoods),
    eventsFromCapsules(data.capsules ?? []),
    eventsFromHabits(data.habits ?? []),
    eventsFromAchievements(data.earnedAchievements ?? []),
  );
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (_, __, dec, hex, name) => {
      if (dec) return String.fromCodePoint(parseInt(dec, 10));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return HTML_ENTITIES[name] ?? " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function wordsFromHtml(html: string): number {
  const t = stripHtml(html);
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Bucket sorted-desc events into natural time groups:
 * Today, Yesterday, This Week, Last Week, This Month, then "Month YYYY".
 */
export type TimelineBucket = { key: string; label: string; events: TimelineEvent[] };

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function startOfWeek(d: Date) {
  const c = startOfDay(d);
  const day = c.getDay(); // Sun=0
  const diff = (day + 6) % 7; // Mon start
  c.setDate(c.getDate() - diff);
  return c;
}

export function groupTimeline(events: TimelineEvent[]): TimelineBucket[] {
  const now = new Date();
  const today = startOfDay(now).getTime();
  const yesterday = today - 24 * 3600 * 1000;
  const thisWeek = startOfWeek(now).getTime();
  const lastWeek = thisWeek - 7 * 24 * 3600 * 1000;
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const buckets = new Map<string, TimelineBucket>();
  const push = (key: string, label: string, e: TimelineEvent) => {
    let b = buckets.get(key);
    if (!b) {
      b = { key, label, events: [] };
      buckets.set(key, b);
    }
    b.events.push(e);
  };

  for (const e of events) {
    if (e.at >= today) push("today", "Today", e);
    else if (e.at >= yesterday) push("yesterday", "Yesterday", e);
    else if (e.at >= thisWeek) push("this-week", "Earlier this week", e);
    else if (e.at >= lastWeek) push("last-week", "Last week", e);
    else if (e.at >= thisMonth) push("this-month", "Earlier this month", e);
    else {
      const d = new Date(e.at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      push(key, label, e);
    }
  }
  return [...buckets.values()];
}
