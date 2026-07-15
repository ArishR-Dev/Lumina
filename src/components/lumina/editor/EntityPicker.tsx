import { useMemo, useState } from "react";
import { useLumina } from "@/lib/lumina-store";
import { stripHtml } from "@/lib/lumina-timeline";
import { X } from "lucide-react";

export type PickerKind = "memory" | "journal" | "note" | "capsule";

type Attrs = { kind: string; refId: string; label: string; emoji: string; href: string };

const HREF: Record<PickerKind, (id: string) => string> = {
  memory: (id) => `/app/memories/${id}`,
  journal: (id) => `/app/journal?date=${id}`,
  note: (id) => `/app/notes/${id}`,
  capsule: (id) => `/app/capsules/${id}`,
};

const EMOJI: Record<PickerKind, string> = {
  memory: "🌸",
  journal: "📖",
  note: "📝",
  capsule: "📦",
};

const TITLE: Record<PickerKind, string> = {
  memory: "Insert a memory",
  journal: "Insert a journal entry",
  note: "Reference another note",
  capsule: "Link a capsule",
};

export function EntityPicker({
  kind, onClose, onPick,
}: {
  kind: PickerKind;
  onClose: () => void;
  onPick: (attrs: Attrs) => void;
}) {
  // Subscribe only to the slice that matches the current picker kind so
  // typing in another surface doesn't recompute this list.
  const memories = useLumina((s) => (kind === "memory" ? s.memories : undefined));
  const journal = useLumina((s) => (kind === "journal" ? s.journal : undefined));
  const notes = useLumina((s) => (kind === "note" ? s.notes : undefined));
  const capsules = useLumina((s) => (kind === "capsule" ? s.capsules : undefined));
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    const source = (() => {
      switch (kind) {
        case "memory":
          return (memories ?? []).map((m) => ({
            id: m.id, label: m.caption || m.album || "Untitled memory",
            hint: m.album, thumb: m.thumbnail || m.src,
          }));
        case "journal":
          return [...(journal ?? [])]
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .map((j) => ({
              id: j.date,
              label: new Date(j.date + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              }),
              hint: j.mood || stripHtml(j.reflection || j.gratitude || j.highlight || "").slice(0, 80),
            }));
        case "note":
          return [...(notes ?? [])]
            .filter((n) => !n.trashed)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((n) => ({ id: n.id, label: n.title || "Untitled", hint: stripHtml(n.content).slice(0, 80) }));
        case "capsule":
          return (capsules ?? []).map((c) => ({
            id: c.id, label: c.title || "A capsule",
            hint: c.opened ? "Opened" : `Sealed until ${new Date(c.unlockAt).toLocaleDateString()}`,
          }));
      }
    })();
    if (!query) return source;
    return source.filter((it) =>
      it.label.toLowerCase().includes(query) || (it.hint || "").toLowerCase().includes(query)
    );
  }, [kind, q, memories, journal, notes, capsules]);

  const pick = (id: string, label: string) => {
    onPick({
      kind,
      refId: id,
      label,
      emoji: EMOJI[kind],
      href: HREF[kind](id),
    });
  };

  return (
    <div className="lumina-rec-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lumina-rec" style={{ padding: 20, textAlign: "left", width: "min(92vw, 460px)" }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display text-xl">{TITLE[kind]}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-white/60 dark:hover:bg-white/10 sm:h-8 sm:w-8">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          aria-label={`Search ${kind}s`}
          className="mb-3 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-2 text-sm outline-none dark:border-white/10 dark:bg-white/5"
        />
        <div className="max-h-[50vh] overflow-y-auto pr-1">
          {items.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No {kind}s yet. Come back once you've saved a few.
            </div>
          )}
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => pick(it.id, it.label)}
              className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/60 dark:hover:bg-white/10"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[oklch(0.72_0.13_340_/_0.15)] text-lg">
                {("thumb" in it && it.thumb) ? (
                  <img src={String(it.thumb)} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  EMOJI[kind]
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{it.label}</div>
                {it.hint && <div className="truncate text-xs text-muted-foreground">{it.hint}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
