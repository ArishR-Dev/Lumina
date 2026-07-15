import { create } from "zustand";
import type { CustomMood, MoodColorName } from "./lumina-moods";

/* ------------------------------------------------------------------ *
 *  Custom throttled persistence.
 *
 *  Replaces zustand's `persist` middleware because that middleware calls
 *  JSON.stringify(entireStore) on every set() — the dominant cost while
 *  typing (updateNote fires per character). We keep the on-disk format
 *  identical to the previous persist output:
 *
 *      { "state": <persisted fields>, "version": 0 }
 *
 *  so switching implementations is fully backwards-compatible. Reads are
 *  synchronous on module load; writes are throttled (trailing edge,
 *  400ms) and also flush on tab hide / unload for crash safety.
 * ------------------------------------------------------------------ */

const STORAGE_KEY = "lumina-storage";
const STORAGE_VERSION = 0;
const WRITE_THROTTLE_MS = 400;

const PERSIST_KEYS = [
  "name",
  "theme",
  "dark",
  "density",
  "fontScale",
  "recentSearches",
  "notes",
  "journal",
  "thoughts",
  "letters",
  "memories",
  "tasks",
  "habits",
  "moods",
  "customMoods",
  "scratch",
  "visited",
  "capsules",
  "sidebarCollapsed",
] as const;

function readInitial(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Legacy format from zustand/persist: { state, version }
    if (parsed && typeof parsed === "object" && "state" in parsed) {
      return (parsed.state as Record<string, unknown>) ?? null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

const initialPersisted = readInitial();

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: Record<string, unknown> | null = null;

function flushWrite() {
  writeTimer = null;
  if (!pendingSnapshot || typeof window === "undefined") return;
  const src = pendingSnapshot;
  pendingSnapshot = null;
  const picked: Record<string, unknown> = {};
  for (const k of PERSIST_KEYS) picked[k] = src[k];
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: picked, version: STORAGE_VERSION }),
    );
  } catch {
    /* quota / disabled — ignore */
  }
}

function scheduleWrite(state: Record<string, unknown>) {
  pendingSnapshot = state;
  if (writeTimer) return;
  writeTimer = setTimeout(flushWrite, WRITE_THROTTLE_MS);
}

if (typeof window !== "undefined") {
  const forceFlush = () => {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    flushWrite();
  };
  window.addEventListener("beforeunload", forceFlush);
  window.addEventListener("pagehide", forceFlush);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") forceFlush();
  });
}

export type Note = {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  favorite?: boolean;
  archived?: boolean;
  trashed?: boolean;
  createdAt: number;
  updatedAt: number;
  color?: string;
  tags?: string[];
  folder?: string;
  versions?: { at: number; content: string }[];
};

export type JournalEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  mood: string;
  gratitude: string;
  reflection: string;
  highlight: string;
  createdAt: number;
  favorite?: boolean;
};

export type Thought = { id: string; title?: string; text: string; createdAt: number; favorite?: boolean };

export type Letter = {
  id: string;
  to: string;
  from: string;
  body: string;
  draft?: boolean;
  favorite?: boolean;
  createdAt: number;
};

export type Memory = {
  id: string;
  /**
   * Legacy full-resolution payload — historically a base64 data URL, kept
   * as a fallback for records written before the media store existed.
   * New memories leave this empty and use `storageKey` + `thumbnail`
   * instead. Migrated legacy records clear this field.
   */
  src: string;
  /** User-facing display name. Rename edits this field only. */
  caption: string;
  album?: string;
  createdAt: number;
  favorite?: boolean;
  /** Immutable original filename from upload (file.name). Never mutated. */
  originalFilename?: string;
  /** MIME type at upload time. */
  mimeType?: string;
  /** IndexedDB key for the original blob (see src/lib/memory-media.ts). */
  storageKey?: string;
  /** Small (~360px) WebP/JPEG data URL rendered in grids and previews. */
  thumbnail?: string;
  /** Natural width of the original image. */
  width?: number;
  /** Natural height of the original image. */
  height?: number;
};



export type Task = { id: string; text: string; done: boolean; createdAt: number };
// extended task fields (all optional; existing tasks stay valid)
export type TaskExt = Task & {
  priority?: "low" | "med" | "high";
  due?: string;
  tags?: string[];
  favorite?: boolean;
};
export type Habit = { id: string; name: string; emoji: string; days: string[]; favorite?: boolean };
export type MoodLog = { date: string; mood: string; note?: string };

export type Capsule = {
  id: string;
  title: string;
  message: string;
  createdAt: number;
  unlockAt: number;
  opened?: boolean;
  cover?: string; // emoji or color name
  favorite?: boolean;
};

export type FavoriteKind =
  | "note" | "journal" | "thought" | "letter" | "memory" | "task" | "capsule";



export type Theme = "sakura" | "lavender" | "midnight" | "ocean" | "arctic" | "rain" | "galaxy" | "sapphire" | "coffee" | "peach";
export type Density = "cozy" | "roomy";
export type FontScale = "s" | "m" | "l";

type State = {
  name: string;
  theme: Theme;
  dark: boolean;
  density: Density;
  fontScale: FontScale;
  recentSearches: string[];
  notes: Note[];
  journal: JournalEntry[];
  thoughts: Thought[];
  letters: Letter[];
  memories: Memory[];
  tasks: TaskExt[];
  habits: Habit[];
  moods: MoodLog[];
  customMoods: CustomMood[];
  scratch: string;
  visited: boolean;
  capsules: Capsule[];
  sidebarCollapsed: boolean;

  setName: (n: string) => void;
  setTheme: (t: Theme) => void;
  toggleDark: () => void;
  setDensity: (d: Density) => void;
  setFontScale: (f: FontScale) => void;
  addRecentSearch: (q: string) => void;
  setVisited: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  addNote: (n?: Partial<Note>) => Note;
  updateNote: (id: string, patch: Partial<Note>) => void;
  duplicateNote: (id: string) => void;
  saveNoteVersion: (id: string) => void;
  deleteNote: (id: string) => void;
  addThought: (text: string, title?: string) => void;
  deleteThought: (id: string) => void;
  addLetter: (l: Omit<Letter, "id" | "createdAt">) => void;
  updateLetter: (id: string, patch: Partial<Letter>) => void;
  deleteLetter: (id: string) => void;
  addMemory: (m: Omit<Memory, "id" | "createdAt">) => void;
  renameMemory: (id: string, displayName: string) => void;
  /** Patch media-only fields (storageKey, thumbnail, width, height, src). */
  updateMemoryMedia: (id: string, patch: Partial<Pick<Memory, "src" | "storageKey" | "thumbnail" | "width" | "height" | "mimeType">>) => void;
  deleteMemory: (id: string) => void;


  saveJournal: (e: Omit<JournalEntry, "id" | "createdAt">) => void;
  deleteJournal: (id: string) => void;
  deleteMood: (date: string) => void;
  addTask: (text: string, extras?: Partial<TaskExt>) => void;
  updateTask: (id: string, patch: Partial<TaskExt>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addHabit: (name: string, emoji: string) => void;
  toggleHabitToday: (id: string) => void;
  logMood: (mood: string, note?: string) => void;
  addCustomMood: (m: { emoji: string; title: string; subtitle?: string; colorName: MoodColorName }) => CustomMood;
  updateCustomMood: (id: string, patch: Partial<Omit<CustomMood, "id" | "createdAt">>) => void;
  deleteCustomMood: (id: string) => void;
  setScratch: (s: string) => void;
  addCapsule: (c: Omit<Capsule, "id" | "createdAt" | "opened">) => void;
  openCapsule: (id: string) => void;
  deleteCapsule: (id: string) => void;

  /** Universal favorite toggle across every content kind. */
  toggleFavorite: (kind: FavoriteKind, id: string) => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

export const useLumina = create<State>()(
  (set, get) => ({
      name: "Pookie",
      theme: "sakura",
      dark: false,
      density: "roomy",
      fontScale: "m",
      recentSearches: [],
      notes: [],
      journal: [],
      thoughts: [],
      letters: [],
      memories: [],
      tasks: [],
      habits: [],
      moods: [],
      customMoods: [],
      scratch: "",
      visited: false,
      capsules: [],
      sidebarCollapsed: false,

      setName: (n) => set({ name: n }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setTheme: (t) => set({ theme: t }),
      toggleDark: () => set({ dark: !get().dark }),
      setDensity: (d) => set({ density: d }),
      setFontScale: (f) => set({ fontScale: f }),
      addRecentSearch: (q) => {
        const s = q.trim();
        if (!s) return;
        const next = [s, ...get().recentSearches.filter((x) => x !== s)].slice(0, 8);
        set({ recentSearches: next });
      },
      setVisited: () => set({ visited: true }),
      addNote: (n) => {
        const note: Note = {
          id: uid(),
          title: n?.title ?? "Untitled",
          content: n?.content ?? "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...n,
        };
        set({ notes: [note, ...get().notes] });
        return note;
      },
      updateNote: (id, patch) =>
        set({
          notes: get().notes.map((x) =>
            x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x,
          ),
        }),
      duplicateNote: (id) => {
        const n = get().notes.find((x) => x.id === id);
        if (!n) return;
        const copy: Note = {
          ...n,
          id: uid(),
          title: n.title + " (copy)",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          versions: [],
        };
        set({ notes: [copy, ...get().notes] });
      },
      saveNoteVersion: (id) =>
        set({
          notes: get().notes.map((n) =>
            n.id === id
              ? {
                  ...n,
                  versions: [
                    { at: Date.now(), content: n.content },
                    ...(n.versions ?? []),
                  ].slice(0, 20),
                }
              : n,
          ),
        }),
      deleteNote: (id) => set({ notes: get().notes.filter((n) => n.id !== id) }),
      addThought: (text, title) =>
        set({ thoughts: [{ id: uid(), title: title?.trim() || undefined, text, createdAt: Date.now() }, ...get().thoughts] }),
      deleteThought: (id) => set({ thoughts: get().thoughts.filter((t) => t.id !== id) }),
      addLetter: (l) =>
        set({ letters: [{ id: uid(), createdAt: Date.now(), ...l }, ...get().letters] }),
      updateLetter: (id, patch) =>
        set({ letters: get().letters.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),
      deleteLetter: (id) => set({ letters: get().letters.filter((l) => l.id !== id) }),
      addMemory: (m) =>
        set({ memories: [{ id: uid(), createdAt: Date.now(), ...m }, ...get().memories] }),
      renameMemory: (id, displayName) =>
        set({
          memories: get().memories.map((m) =>
            m.id === id ? { ...m, caption: displayName } : m,
          ),
        }),
      updateMemoryMedia: (id, patch) =>
        set({
          memories: get().memories.map((m) =>
            m.id === id ? { ...m, ...patch } : m,
          ),
        }),
      deleteMemory: (id) => set({ memories: get().memories.filter((m) => m.id !== id) }),

      saveJournal: (e) => {
        const existing = get().journal.find((j) => j.date === e.date);
        if (existing) {
          set({
            journal: get().journal.map((j) =>
              j.date === e.date ? { ...j, ...e } : j,
            ),
          });
        } else {
          set({ journal: [{ id: uid(), createdAt: Date.now(), ...e }, ...get().journal] });
        }
      },
      deleteJournal: (id) => set({ journal: get().journal.filter((j) => j.id !== id) }),
      deleteMood: (date) => set({ moods: get().moods.filter((m) => m.date !== date) }),
      addTask: (text, extras) =>
        set({
          tasks: [
            { id: uid(), text, done: false, createdAt: Date.now(), ...extras },
            ...get().tasks,
          ],
        }),
      updateTask: (id, patch) =>
        set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      toggleTask: (id) =>
        set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }),
      deleteTask: (id) => set({ tasks: get().tasks.filter((t) => t.id !== id) }),
      addHabit: (name, emoji) =>
        set({ habits: [...get().habits, { id: uid(), name, emoji, days: [] }] }),
      toggleHabitToday: (id) => {
        const t = today();
        set({
          habits: get().habits.map((h) =>
            h.id === id
              ? { ...h, days: h.days.includes(t) ? h.days.filter((d) => d !== t) : [...h.days, t] }
              : h,
          ),
        });
      },
      logMood: (mood, note) => {
        const t = today();
        const filtered = get().moods.filter((m) => m.date !== t);
        set({ moods: [{ date: t, mood, note }, ...filtered] });
      },
      addCustomMood: ({ emoji, title, subtitle, colorName }) => {
        const now = Date.now();
        const mood: CustomMood = {
          id: "c_" + uid(),
          emoji: emoji.trim(),
          title: title.trim().slice(0, 24),
          subtitle: subtitle?.trim().slice(0, 80) || undefined,
          colorName,
          createdAt: now,
          updatedAt: now,
        };
        set({ customMoods: [...get().customMoods, mood] });
        return mood;
      },
      updateCustomMood: (id, patch) => {
        set({
          customMoods: get().customMoods.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...patch,
                  title: patch.title != null ? patch.title.trim().slice(0, 24) : c.title,
                  subtitle:
                    patch.subtitle !== undefined
                      ? (patch.subtitle?.trim().slice(0, 80) || undefined)
                      : c.subtitle,
                  updatedAt: Date.now(),
                }
              : c,
          ),
        });
      },
      deleteCustomMood: (id) => {
        set({ customMoods: get().customMoods.filter((c) => c.id !== id) });
      },
      setScratch: (s) => set({ scratch: s }),
      addCapsule: (c) =>
        set({
          capsules: [
            { id: uid(), createdAt: Date.now(), opened: false, ...c },
            ...get().capsules,
          ],
        }),
      openCapsule: (id) =>
        set({ capsules: get().capsules.map((c) => (c.id === id ? { ...c, opened: true } : c)) }),
      deleteCapsule: (id) => set({ capsules: get().capsules.filter((c) => c.id !== id) }),

      toggleFavorite: (kind, id) => {
        const flip = <T extends { id: string; favorite?: boolean }>(xs: T[]) =>
          xs.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x));
        const s = get();
        switch (kind) {
          case "note":
            return set({ notes: s.notes.map((n) => (n.id === id ? { ...n, favorite: !n.favorite, updatedAt: Date.now() } : n)) });
          case "journal": return set({ journal: flip(s.journal) });
          case "thought": return set({ thoughts: flip(s.thoughts) });
          case "letter": return set({ letters: flip(s.letters) });
          case "memory": return set({ memories: flip(s.memories) });
          case "task": return set({ tasks: flip(s.tasks) });
          case "capsule": return set({ capsules: flip(s.capsules) });
        }
      },
    }),

);

// Hydrate persisted fields synchronously (before any consumer reads).
if (initialPersisted) {
  useLumina.setState(initialPersisted as Partial<State>);
}

// Subscribe once, at module scope. Every store mutation only queues a
// throttled write — no serialization happens in the set() callchain.
useLumina.subscribe((s) => {
  scheduleWrite(s as unknown as Record<string, unknown>);
});


export const wordsIn = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;