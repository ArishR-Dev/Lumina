// Dynamic greeting engine, daily whisper library, gentle insights,
// on-this-day retrieval, and seasonal helpers for Lumina.

import type { JournalEntry, Note, Memory, Letter, Thought, MoodLog } from "./lumina-store";

// ---------- Time helpers ----------

export type TimeOfDay = "lateNight" | "earlyMorning" | "morning" | "midday" | "afternoon" | "evening" | "night";

export function timeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours();
  if (h < 3) return "lateNight";
  if (h < 6) return "earlyMorning";
  if (h < 11) return "morning";
  if (h < 14) return "midday";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

export type Season = "spring" | "summer" | "autumn" | "winter";
export function season(d = new Date()): Season {
  const m = d.getMonth(); // 0-based
  if (m <= 1 || m === 11) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "autumn";
}

// ---------- Greetings ----------

type GreetLine = { title: (name: string) => string; sub: string };

const BY_TOD: Record<TimeOfDay, GreetLine[]> = {
  lateNight: [
    { title: (n) => `Still awake, ${n}? 🌙`, sub: "Late-night thoughts often become beautiful memories." },
    { title: (n) => `Quiet hours, ${n} ✨`, sub: "The world's asleep — this space is yours." },
    { title: (n) => `Night owl mode, ${n} 🦉`, sub: "Rest when you can. I'll keep the pages warm." },
  ],
  earlyMorning: [
    { title: (n) => `Early start, ${n} 🌅`, sub: "The world is soft and new. Ease into it." },
    { title: (n) => `Sunrise thoughts, ${n} ☕`, sub: "A slow beginning is still a beginning." },
  ],
  morning: [
    { title: (n) => `Good morning, ${n} ☀️`, sub: "Hope today brings something wonderful." },
    { title: (n) => `Rise and shine, ${n} 🌼`, sub: "A gentle start makes a gentle day." },
    { title: (n) => `Morning, ${n} 🌸`, sub: "One small kindness to yourself first — the rest can wait." },
    { title: (n) => `Hi ${n} 🍵`, sub: "Warm drink, deep breath, then the world." },
  ],
  midday: [
    { title: (n) => `Hey ${n} 🌿`, sub: "Halfway through — you're doing beautifully." },
    { title: (n) => `Little pause, ${n}?`, sub: "Even a minute here counts." },
  ],
  afternoon: [
    { title: (n) => `Good afternoon, ${n} 🌼`, sub: "A cozy corner of the day, just for you." },
    { title: (n) => `Afternoon light, ${n} ✨`, sub: "Whatever's on your mind — write it down softly." },
    { title: (n) => `How's it going, ${n}?`, sub: "No pressure. Just a moment with yourself." },
  ],
  evening: [
    { title: (n) => `Good evening, ${n} 🌸`, sub: "A quiet close to a full day." },
    { title: (n) => `Wind down, ${n} 🕯️`, sub: "Let the day settle into something gentle." },
    { title: (n) => `Evening, ${n} 🍂`, sub: "One small reflection can carry the whole day forward." },
  ],
  night: [
    { title: (n) => `Goodnight soon, ${n} 🌙`, sub: "You made it through — that's already lovely." },
    { title: (n) => `Cozy hours, ${n} ✨`, sub: "Little thoughts before sleep are the softest ones." },
  ],
};

const DAY_FLAVOR: Record<number, string[]> = {
  0: ["Sunday softness — nothing to prove today.", "Slow Sunday, ${n}. Rest counts as progress."],
  1: ["Fresh start, ${n} — new week, gentle pace.", "Monday, but softly."],
  2: ["Tuesday quiet — you've got this.", "One step at a time, ${n}."],
  3: ["Middle of the week, ${n} — a small check-in matters.", "Wednesday breather."],
  4: ["Almost there, ${n} 🌿", "Thursday — keep it kind to yourself."],
  5: ["Happy Friday 🌸 Take a moment for yourself today.", "Friday feeling, ${n} — soft landings ahead."],
  6: ["Slow Saturday, ${n} ☕", "Weekend mode — write anything or nothing at all."],
};

export type GreetingCtx = {
  name: string;
  now?: Date;
  streak?: number;
  recentActivityCount?: number; // entries in past 24h
  lastWroteDaysAgo?: number;
};

export type Greeting = { title: string; sub: string };

// Deterministic-per-day picker so the greeting is stable within a session
function pickByDay<T>(arr: T[], now: Date): T {
  const seed = now.getFullYear() * 1000 + (now.getMonth() + 1) * 31 + now.getDate();
  return arr[seed % arr.length];
}

export function buildGreeting({ name, now = new Date(), streak = 0, recentActivityCount = 0, lastWroteDaysAgo }: GreetingCtx): Greeting {
  const tod = timeOfDay(now);
  const base = pickByDay(BY_TOD[tod], now);
  const title = base.title(name);
  let sub = base.sub;

  // Streak flavor (overrides sub sometimes)
  if (streak >= 30) sub = `${streak}-day writing streak — that's remarkable, ${name}. 🌟`;
  else if (streak >= 7) sub = `${streak} days in a row. Quietly wonderful.`;
  else if (streak >= 3) sub = `${streak}-day streak — a lovely little rhythm.`;
  else if (lastWroteDaysAgo !== undefined && lastWroteDaysAgo >= 5) sub = `It's been a few days — no worries. The page is still here.`;
  else if (recentActivityCount >= 5) sub = `You've been writing lots today — proud of you.`;
  else {
    // Sprinkle in day-of-week flavor half the time
    const seed = now.getDate() + now.getMonth();
    if (seed % 2 === 0) {
      const flavors = DAY_FLAVOR[now.getDay()] ?? [];
      if (flavors.length) sub = flavors[seed % flavors.length].replace(/\$\{n\}/g, name);
    }
  }
  return { title, sub };
}

// ---------- Daily Whisper library ----------

export type WhisperCategory = "friendship" | "growth" | "kindness" | "creativity" | "dreams" | "peace" | "motivation" | "reflection";

export type Whisper = { text: string; category: WhisperCategory };

export const WHISPERS: Whisper[] = [
  { text: "You're doing better than you think — really.", category: "kindness" },
  { text: "Every small step counts. Look how far you've come.", category: "growth" },
  { text: "Take a breath. Today can just be gentle.", category: "peace" },
  { text: "Your story is worth telling — one kind chapter at a time.", category: "reflection" },
  { text: "Be proud of yourself today, even for the little things.", category: "kindness" },
  { text: "You've got a whole friend cheering you on. 🌸", category: "friendship" },
  { text: "Little by little becomes a lot.", category: "growth" },
  { text: "Rest is a beautiful kind of productivity.", category: "peace" },
  { text: "Write the sentence only you could write.", category: "creativity" },
  { text: "Dreams like yours deserve a quiet place to grow.", category: "dreams" },
  { text: "The good days are watching you build them.", category: "motivation" },
  { text: "Kindness to yourself is contagious — it spreads inward first.", category: "kindness" },
  { text: "A friend is anyone who leaves you softer than they found you.", category: "friendship" },
  { text: "You don't have to be finished to be worthy.", category: "growth" },
  { text: "Notice the small light today. It's there.", category: "reflection" },
  { text: "The blank page is patient. Take your time.", category: "creativity" },
  { text: "Let today be enough exactly as it is.", category: "peace" },
  { text: "A single sentence, gently written, can hold a whole day.", category: "reflection" },
  { text: "Somewhere ahead, a future you is thankful you kept going.", category: "motivation" },
  { text: "Little dreams count. Whisper them here.", category: "dreams" },
  { text: "You're allowed to change your mind, your plans, your path.", category: "growth" },
  { text: "Warmth first. Everything else follows.", category: "kindness" },
  { text: "The world is quieter when you're honest with yourself.", category: "reflection" },
  { text: "Show up softly. It still counts.", category: "motivation" },
  { text: "Make something small today. Only for you.", category: "creativity" },
  { text: "Your calm is a gift — first to yourself, then to everyone.", category: "peace" },
  { text: "Someone (me!) is proud of you today. 🌸", category: "friendship" },
  { text: "Even the moon rests. So can you.", category: "peace" },
  { text: "A page a day keeps the fog away.", category: "reflection" },
  { text: "You are the author of a very good story.", category: "creativity" },
];

export function whisperForToday(now = new Date()): Whisper {
  return pickByDay(WHISPERS, now);
}

// ---------- On This Day ----------

export type OnThisDayItem =
  | { kind: "journal"; yearsAgo: number; date: string; entry: JournalEntry }
  | { kind: "note"; yearsAgo: number; date: string; note: Note }
  | { kind: "memory"; yearsAgo: number; date: string; memory: Memory }
  | { kind: "letter"; yearsAgo: number; date: string; letter: Letter };

function isSameDayOfYear(a: Date, b: Date) {
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function onThisDay(
  now: Date,
  data: { journal: JournalEntry[]; notes: Note[]; memories: Memory[]; letters: Letter[] },
): OnThisDayItem[] {
  const out: OnThisDayItem[] = [];
  const y = (past: Date) => now.getFullYear() - past.getFullYear();
  data.journal.forEach((j) => {
    const d = new Date(j.date + "T00:00:00");
    if (isSameDayOfYear(d, now) && y(d) >= 1) out.push({ kind: "journal", yearsAgo: y(d), date: j.date, entry: j });
  });
  data.notes.forEach((n) => {
    const d = new Date(n.createdAt);
    if (isSameDayOfYear(d, now) && y(d) >= 1) out.push({ kind: "note", yearsAgo: y(d), date: d.toISOString().slice(0, 10), note: n });
  });
  data.memories.forEach((m) => {
    const d = new Date(m.createdAt);
    if (isSameDayOfYear(d, now) && y(d) >= 1) out.push({ kind: "memory", yearsAgo: y(d), date: d.toISOString().slice(0, 10), memory: m });
  });
  data.letters.forEach((l) => {
    const d = new Date(l.createdAt);
    if (isSameDayOfYear(d, now) && y(d) >= 1) out.push({ kind: "letter", yearsAgo: y(d), date: d.toISOString().slice(0, 10), letter: l });
  });
  return out.sort((a, b) => a.yearsAgo - b.yearsAgo);
}

// ---------- Gentle insights ----------

export type Insight = { text: string; tone: "cheer" | "notice" | "nudge" };

export function buildInsights(
  now: Date,
  data: { notes: Note[]; journal: JournalEntry[]; thoughts: Thought[]; moods: MoodLog[] },
): Insight[] {
  const insights: Insight[] = [];
  const dayMs = 86_400_000;
  const inLastNDays = (ts: number, n: number) => now.getTime() - ts <= n * dayMs;
  const thisWeekNotes = data.notes.filter((n) => inLastNDays(n.updatedAt, 7)).length;
  const lastWeekNotes = data.notes.filter((n) => !inLastNDays(n.updatedAt, 7) && inLastNDays(n.updatedAt, 14)).length;
  if (thisWeekNotes > lastWeekNotes && thisWeekNotes >= 3) {
    insights.push({ text: `You've written more this week than last week — lovely momentum.`, tone: "cheer" });
  }
  const weekendMoods = data.moods.filter((m) => {
    const d = new Date(m.date + "T00:00:00").getDay();
    return d === 0 || d === 6;
  });
  const positive = ["🌸", "☺️", "😌", "🥰", "✨"];
  const weekendPos = weekendMoods.filter((m) => positive.includes(m.mood)).length;
  if (weekendMoods.length >= 3 && weekendPos / weekendMoods.length > 0.6) {
    insights.push({ text: `You seem happiest on weekends — worth noticing.`, tone: "notice" });
  }
  const lastAny = Math.max(
    data.notes[0]?.updatedAt ?? 0,
    data.thoughts[0]?.createdAt ?? 0,
    data.journal[0] ? new Date(data.journal[0].date).getTime() : 0,
  );
  const daysSince = lastAny ? Math.floor((now.getTime() - lastAny) / dayMs) : 0;
  if (lastAny && daysSince >= 3 && daysSince <= 10) {
    insights.push({ text: `It's been a few days since you wrote — the page is patient.`, tone: "nudge" });
  }
  const totalThisMonth = data.notes.filter((n) => new Date(n.updatedAt).getMonth() === now.getMonth()).length
    + data.journal.filter((j) => new Date(j.date).getMonth() === now.getMonth()).length;
  if (totalThisMonth >= 20) insights.push({ text: `${totalThisMonth} entries this month. Quietly remarkable.`, tone: "cheer" });
  return insights.slice(0, 3);
}

export function daysSinceLastWrite(
  now: Date,
  data: { notes: Note[]; journal: JournalEntry[]; thoughts: Thought[] },
): number | undefined {
  const last = Math.max(
    data.notes[0]?.updatedAt ?? 0,
    data.thoughts[0]?.createdAt ?? 0,
    data.journal[0] ? new Date(data.journal[0].date).getTime() : 0,
  );
  if (!last) return undefined;
  return Math.floor((now.getTime() - last) / 86_400_000);
}

// ---------- Milestones ----------

export type Milestone = { id: string; label: string; emoji: string };

export function detectMilestones(data: {
  notes: Note[];
  journal: JournalEntry[];
  letters: Letter[];
  memories: Memory[];
  streak: number;
  habits?: { days: string[] }[];
  capsules?: { opened?: boolean }[];
}): Milestone[] {
  const out: Milestone[] = [];
  const notes = data.notes.length;
  if (notes === 1) out.push({ id: "note-1", label: "First note written", emoji: "📝" });
  if (notes === 10) out.push({ id: "note-10", label: "10 notes and counting", emoji: "✨" });
  if (notes === 100) out.push({ id: "note-100", label: "100 notes — that's a whole book!", emoji: "📚" });
  if (data.journal.length === 1) out.push({ id: "journal-1", label: "First journal entry", emoji: "🌸" });
  if (data.letters.length === 1) out.push({ id: "letter-1", label: "First letter written", emoji: "💌" });
  if (data.memories.length === 1) out.push({ id: "memory-1", label: "First memory saved", emoji: "📷" });
  if (data.streak === 7) out.push({ id: "streak-7", label: "7-day writing streak", emoji: "🔥" });
  if (data.streak === 30) out.push({ id: "streak-30", label: "30-day writing streak", emoji: "🌟" });

  // Habits — total completed days across all habits.
  const habitDaysTotal = (data.habits ?? []).reduce((sum, h) => sum + h.days.length, 0);
  if (habitDaysTotal === 1) out.push({ id: "habit-1", label: "First habit day", emoji: "🌿" });
  if (habitDaysTotal === 10) out.push({ id: "habit-10", label: "10 habit days", emoji: "🌱" });
  if (habitDaysTotal === 50) out.push({ id: "habit-50", label: "50 habit days — a rhythm", emoji: "🌳" });
  if (habitDaysTotal === 100) out.push({ id: "habit-100", label: "100 habit days", emoji: "🏆" });

  // Capsules — a milestone the first time one is opened.
  const capsulesOpened = (data.capsules ?? []).filter((c) => c.opened).length;
  if (capsulesOpened === 1) out.push({ id: "capsule-1", label: "First capsule opened", emoji: "🎁" });
  if (capsulesOpened === 5) out.push({ id: "capsule-5", label: "5 capsules opened", emoji: "✨" });

  return out;
}
