// Farewell entity abstraction.
//
// The ritual can release items from many collections. This module
// centralises the "how do I read / delete an item of kind K?" logic so
// the ritual scene and picker routes don't need to know about each
// individual store slice.

import { useMemo } from "react";
import { useLumina } from "@/lib/lumina-store";
import { stripHtml } from "@/lib/lumina-timeline";
import { deleteBlob as deleteMemoryBlob } from "@/lib/memory-media";
import type { AshEntityType } from "@/lib/farewell/ashes";

export type EntityKind = AshEntityType;

export type EntityMeta = {
  kind: EntityKind;
  label: string;
  plural: string;
  emoji: string;
  hint: string;
};

export const ENTITY_META: Record<EntityKind, EntityMeta> = {
  note:    { kind: "note",    label: "Note",    plural: "Notes",    emoji: "📝", hint: "A written thought." },
  letter:  { kind: "letter",  label: "Letter",  plural: "Letters",  emoji: "💌", hint: "Something you wrote to someone." },
  memory:  { kind: "memory",  label: "Memory",  plural: "Memories", emoji: "🖼",  hint: "A saved image or moment." },
  journal: { kind: "journal", label: "Journal", plural: "Journal",  emoji: "📅", hint: "A day you'd like to close." },
  thought: { kind: "thought", label: "Thought", plural: "Thoughts", emoji: "💭", hint: "A fleeting note-to-self." },
  mood:    { kind: "mood",    label: "Mood",    plural: "Mood Entries", emoji: "❤️", hint: "A feeling you're ready to release." },
  custom:  { kind: "custom",  label: "Custom",  plural: "Custom",   emoji: "✍️", hint: "Write something to release." },
};

export const PICKABLE_KINDS: EntityKind[] = [
  "note", "letter", "memory", "journal", "thought", "mood",
];

export type EntityListItem = {
  id: string;
  title: string;
  preview: string;
  timestamp: number;
};

// ------------------------------------------------------------------
// Custom farewell store — text the user writes *just* for the ritual.
// Not persisted in the main store; held in memory + sessionStorage so a
// refresh mid-flow doesn't lose it.
// ------------------------------------------------------------------

const CUSTOM_KEY = "lumina-farewell-custom";
type CustomMap = Record<string, { title: string; content: string }>;

function readCustomStore(): CustomMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(CUSTOM_KEY) || "{}");
  } catch { return {}; }
}
function writeCustomStore(m: CustomMap) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(CUSTOM_KEY, JSON.stringify(m)); } catch {}
}

export function createCustomFarewell(title: string, content: string): string {
  const id = "c_" + Math.random().toString(36).slice(2, 10);
  return createCustomFarewellWithId(id, title, content);
}

export function createCustomFarewellWithId(id: string, title: string, content: string): string {
  const m = readCustomStore();
  m[id] = { title: title.trim(), content };
  writeCustomStore(m);
  return id;
}

export function readCustomFarewell(id: string) {
  return readCustomStore()[id] ?? null;
}

export function deleteCustomFarewell(id: string) {
  const m = readCustomStore();
  if (m[id]) { delete m[id]; writeCustomStore(m); }
}

// ------------------------------------------------------------------
// Hooks / helpers
// ------------------------------------------------------------------

function toPreview(html: string, max = 140) {
  const s = stripHtml(html || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Read a snapshot of a specific entity. Returns null while data hasn't
 * loaded / when the item was already deleted.
 */
export function useEntitySnapshot(kind: EntityKind, id: string) {
  const custom = useMemo(
    () => (kind === "custom" ? readCustomFarewell(id) : null),
    [kind, id],
  );
  // Select raw arrays (stable references) — derive the snapshot via useMemo.
  const notes = useLumina((s) => s.notes);
  const letters = useLumina((s) => s.letters);
  const memories = useLumina((s) => s.memories);
  const journal = useLumina((s) => s.journal);
  const thoughts = useLumina((s) => s.thoughts);
  const moods = useLumina((s) => s.moods);

  return useMemo((): { title: string; content: string } | null => {
    if (kind === "custom") return custom;
    switch (kind) {
      case "note": {
        const n = notes.find((x) => x.id === id);
        return n ? { title: n.title || "Untitled", content: n.content || "" } : null;
      }
      case "letter": {
        const l = letters.find((x) => x.id === id);
        return l ? { title: `To ${l.to || "—"}`, content: l.body || "" } : null;
      }
      case "memory": {
        const m = memories.find((x) => x.id === id);
        return m ? { title: m.caption || "Memory", content: m.thumbnail || m.src || "" } : null;
      }
      case "journal": {
        const j = journal.find((x) => x.id === id);
        return j ? { title: j.date, content: [j.gratitude, j.reflection, j.highlight].filter(Boolean).join("\n\n") } : null;
      }
      case "thought": {
        const t = thoughts.find((x) => x.id === id);
        return t ? { title: "Thought", content: t.text } : null;
      }
      case "mood": {
        const mo = moods.find((x) => x.date === id);
        return mo ? { title: mo.date, content: `${mo.mood}${mo.note ? "\n\n" + mo.note : ""}` } : null;
      }
    }
    return null;
  }, [kind, id, custom, notes, letters, memories, journal, thoughts, moods]);
}

/** Returns a stable delete function for the given kind + id. */
export function useDeleteEntity() {
  const deleteNote = useLumina((s) => s.deleteNote);
  const deleteLetter = useLumina((s) => s.deleteLetter);
  const deleteMemory = useLumina((s) => s.deleteMemory);
  const deleteJournal = useLumina((s) => s.deleteJournal);
  const deleteThought = useLumina((s) => s.deleteThought);
  const deleteMood = useLumina((s) => s.deleteMood);
  const memories = useLumina((s) => s.memories);
  return (kind: EntityKind, id: string) => {
    switch (kind) {
      case "note":    deleteNote(id); break;
      case "letter":  deleteLetter(id); break;
      case "memory": {
        // Release the IDB blob (if any) before dropping the record.
        const m = memories.find((x) => x.id === id);
        if (m?.storageKey) void deleteMemoryBlob(m.storageKey);
        deleteMemory(id);
        break;
      }
      case "journal": deleteJournal(id); break;
      case "thought": deleteThought(id); break;
      case "mood":    deleteMood(id); break;
      case "custom":  deleteCustomFarewell(id); break;
    }
  };
}

/** List items of a kind for the picker screen. */
export function useEntityList(kind: EntityKind): EntityListItem[] {
  const notes = useLumina((s) => s.notes);
  const letters = useLumina((s) => s.letters);
  const memories = useLumina((s) => s.memories);
  const journal = useLumina((s) => s.journal);
  const thoughts = useLumina((s) => s.thoughts);
  const moods = useLumina((s) => s.moods);

  return useMemo((): EntityListItem[] => {
    switch (kind) {
      case "note":
        return notes
          .filter((n) => !n.trashed)
          .map((n) => ({
            id: n.id,
            title: n.title || "Untitled",
            preview: toPreview(n.content),
            timestamp: n.updatedAt || n.createdAt,
          }));
      case "letter":
        return letters.map((l) => ({
          id: l.id,
          title: `To ${l.to || "—"}`,
          preview: toPreview(l.body),
          timestamp: l.createdAt,
        }));
      case "memory":
        return memories.map((m) => {
          const src = m.thumbnail || m.src || "";
          const isImage =
            !!m.storageKey ||
            src.startsWith("data:image/") ||
            src.startsWith("blob:") ||
            /^https?:\/\//i.test(src);
          return {
            id: m.id,
            title: m.caption || "Memory",
            preview: m.album || (isImage ? "📷 Image memory" : toPreview(src)),
            timestamp: m.createdAt,
          };
        });
      case "journal":
        return journal.map((j) => ({
          id: j.id,
          title: j.date,
          preview: toPreview(j.reflection || j.gratitude || j.highlight),
          timestamp: j.createdAt,
        }));
      case "thought":
        return thoughts.map((t) => ({
          id: t.id,
          title: "Thought",
          preview: toPreview(t.text),
          timestamp: t.createdAt,
        }));
      case "mood":
        return moods.map((m) => ({
          id: m.date,
          title: m.date,
          preview: `${m.mood}${m.note ? " · " + m.note : ""}`,
          timestamp: new Date(m.date).getTime() || 0,
        }));
      case "custom":
        return [];
    }
  }, [kind, notes, letters, memories, journal, thoughts, moods]);
}

