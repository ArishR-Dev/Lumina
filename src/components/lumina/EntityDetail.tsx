import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Heart, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/lumina/GlassCard";
import { PageHeader } from "@/components/lumina/PageHeader";
import { MoodBadge } from "@/components/lumina/MoodBadge";
import { useLumina, type FavoriteKind } from "@/lib/lumina-store";
import { resolveMood } from "@/lib/lumina-moods";
import { stripHtml } from "@/lib/lumina-timeline";
import { notify } from "@/lib/lumina-toasts";
import { luminaDialog } from "@/lib/lumina-dialog";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize-html";

type Kind = FavoriteKind;

const LIST_HREF: Record<Kind, string> = {
  note: "/app/notes",
  journal: "/app/journal",
  thought: "/app/thoughts",
  letter: "/app/letters",
  memory: "/app/memories",
  task: "/app/tasks",
  capsule: "/app/capsules",
};

const LABEL: Record<Kind, string> = {
  note: "Note",
  journal: "Journal entry",
  thought: "Thought",
  letter: "Letter",
  memory: "Memory",
  task: "Task",
  capsule: "Capsule",
};

export function EntityDetail({ kind, id }: { kind: Kind; id: string }) {
  const item = useLumina((s) => pickItem(s, kind, id));
  const customMoods = useLumina((s) => s.customMoods);
  const toggleFavorite = useLumina((s) => s.toggleFavorite);
  const router = useRouter();
  const nav = useNavigate();

  if (!item) {
    return (
      <div>
        <PageHeader eyebrow={LABEL[kind]} title="Not found" subtitle="This entry has been removed or never existed." />
        <Link
          to={LIST_HREF[kind] as "/app/notes"}
          className="inline-flex items-center gap-2 rounded-full bg-primary/90 px-4 py-2 text-sm text-primary-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {LIST_HREF[kind].replace("/app/", "")}
        </Link>
      </div>
    );
  }

  const isFav = !!(item as { favorite?: boolean }).favorite;
  const back = () => {
    if (window.history.length > 1) router.history.back();
    else nav({ to: LIST_HREF[kind] as "/app/notes" });
  };
  const onFav = () => {
    toggleFavorite(kind, id);
    notify.favorited(!isFav);
  };
  const onDelete = async () => {
    const label = LABEL[kind].toLowerCase();
    const ok = await luminaDialog.danger({
      title: `Delete this ${label}?`,
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    deleteItem(useLumina.getState(), kind, id);
    notify.deleted(LABEL[kind]);
    nav({ to: LIST_HREF[kind] as "/app/notes" });
  };

  const meta = renderMeta(customMoods, kind, item);
  const body = renderBody(kind, item);
  const title = renderTitle(kind, item);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={back}
          className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground transition hover:text-foreground dark:border-white/10 dark:bg-white/5"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onFav}
            aria-pressed={isFav}
            aria-label={isFav ? "Unfavorite" : "Favorite"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-xs transition dark:border-white/10 dark:bg-white/5",
              isFav && "text-rose-500",
            )}
          >
            <Heart className={cn("h-3.5 w-3.5", isFav && "fill-current")} />
            {isFav ? "Favorited" : "Favorite"}
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-destructive dark:border-white/10 dark:bg-white/5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>

      <PageHeader eyebrow={LABEL[kind]} title={title} subtitle={meta} />

      <GlassCard className="mt-2">{body}</GlassCard>

      <div className="mt-4 text-center">
        <Link
          to={LIST_HREF[kind] as "/app/notes"}
          className="text-xs uppercase tracking-[0.24em] text-muted-foreground hover:text-foreground"
        >
          all {LIST_HREF[kind].replace("/app/", "")} →
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Renderers per kind. Kept intentionally simple — the list pages
 *  remain the primary edit surface; detail pages are for reading,
 *  sharing links, and quick favorite/delete actions.
 * ------------------------------------------------------------------ */

function pickItem(s: ReturnType<typeof useLumina.getState>, kind: Kind, id: string) {
  switch (kind) {
    case "note": return s.notes.find((n) => n.id === id);
    case "journal": return s.journal.find((j) => j.id === id);
    case "thought": return s.thoughts.find((t) => t.id === id);
    case "letter": return s.letters.find((l) => l.id === id);
    case "memory": return s.memories.find((m) => m.id === id);
    case "task": return s.tasks.find((t) => t.id === id);
    case "capsule": return s.capsules.find((c) => c.id === id);
  }
}

function deleteItem(s: ReturnType<typeof useLumina.getState>, kind: Kind, id: string) {
  switch (kind) {
    case "note": return s.deleteNote(id);
    case "journal": return s.deleteJournal(id);
    case "thought": return s.deleteThought(id);
    case "letter": return s.deleteLetter(id);
    case "memory": return s.deleteMemory(id);
    case "task": return s.deleteTask(id);
    case "capsule": return s.deleteCapsule(id);
  }
}

function renderTitle(kind: Kind, item: unknown): string {
  const it = item as Record<string, unknown>;
  switch (kind) {
    case "note": return String(it.title || "Untitled");
    case "journal": return new Date(String(it.date) + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    case "thought": return String(it.title || "A passing thought");
    case "letter": return `To ${it.to || "someone dear"}`;
    case "memory": return String(it.caption || "A memory");
    case "task": return String(it.text || "Task");
    case "capsule": return String(it.title || "A capsule");
  }
}

function renderMeta(customMoods: ReturnType<typeof useLumina.getState>["customMoods"], kind: Kind, item: unknown): string {
  const it = item as Record<string, unknown>;
  const created = it.createdAt ? new Date(Number(it.createdAt)).toLocaleString() : "";
  switch (kind) {
    case "note": return `Updated ${new Date(Number(it.updatedAt)).toLocaleString()}`;
    case "journal": {
      const rm = resolveMood(String(it.mood ?? ""), customMoods);
      return rm ? `${rm.emoji} ${rm.title}` : "Kept safely";
    }
    case "task": return it.done ? `Completed · created ${created}` : `Open · created ${created}`;
    case "capsule": {
      const unlockAt = Number(it.unlockAt);
      const opened = Boolean(it.opened);
      return opened
        ? `Opened · unlocked ${new Date(unlockAt).toLocaleDateString()}`
        : `Sealed until ${new Date(unlockAt).toLocaleDateString()}`;
    }
    default: return `Created ${created}`;
  }
}

function renderBody(kind: Kind, item: unknown) {
  const it = item as Record<string, unknown>;
  switch (kind) {
    case "note": {
      const html = String(it.content ?? "");
      const tags = (it.tags as string[] | undefined) ?? [];
      return (
        <div>
          <div className="prose prose-neutral dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) || "<p><em>empty</em></p>" }} />
          {tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {tags.map((t) => (
                <Link key={t} to="/app/tags/$tag" params={{ tag: t }} className="rounded-full bg-white/60 px-3 py-1 text-xs dark:bg-white/5">#{t}</Link>
              ))}
            </div>
          )}
        </div>
      );
    }
    case "journal":
      return (
        <div className="space-y-4">
          {(it.gratitude as string) && <Section label="Gratitude" text={String(it.gratitude)} />}
          {(it.reflection as string) && <Section label="Reflection" text={String(it.reflection)} />}
          {(it.highlight as string) && <Section label="Highlight" text={String(it.highlight)} />}
        </div>
      );
    case "thought":
      return <p className="whitespace-pre-wrap font-hand text-2xl leading-relaxed">{String(it.text ?? "")}</p>;
    case "letter":
      return (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            From {String(it.from || "you")} · to {String(it.to || "someone")}
          </div>
          <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{String(it.body ?? "")}</p>
        </div>
      );
    case "memory":
      return (
        <div className="space-y-4">
          {typeof it.src === "string" && it.src && (
            <img src={it.src} alt={String(it.caption ?? "memory")} loading="lazy" className="max-h-[70vh] w-full rounded-2xl object-contain" />
          )}
          {Boolean(it.album) && <div className="text-xs uppercase tracking-widest text-muted-foreground">Album · {String(it.album)}</div>}
          {Boolean(it.caption) && <p className="text-lg">{String(it.caption)}</p>}
        </div>
      );
    case "task": {
      const tags = (it.tags as string[] | undefined) ?? [];
      return (
        <div className="space-y-3">
          <p className={cn("text-xl", Boolean(it.done) && "line-through text-muted-foreground")}>{String(it.text ?? "")}</p>
          <div className="text-xs text-muted-foreground">
            {it.priority ? `Priority: ${String(it.priority)}` : ""}
            {it.due ? ` · Due ${String(it.due)}` : ""}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <Link key={t} to="/app/tags/$tag" params={{ tag: t }} className="rounded-full bg-white/60 px-3 py-1 text-xs dark:bg-white/5">#{t}</Link>
              ))}
            </div>
          )}
        </div>
      );
    }
    case "capsule":
      return (
        <div className="space-y-3">
          {Boolean(it.cover) && <div className="text-5xl">{String(it.cover)}</div>}
          {!it.opened
            ? <p className="italic text-muted-foreground">This capsule is still sealed. It will open on {new Date(Number(it.unlockAt)).toLocaleDateString()}.</p>
            : <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{String(it.message ?? "")}</p>}
        </div>
      );
  }
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{label}</div>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </div>
  );
}

/* Small helper so MoodBadge import stays used elsewhere; not referenced here
   directly but re-exported for parity with the list pages. */
export { MoodBadge };
// stripHtml/utility silenced-unused suppressor: keep import alive for editors
void stripHtml;
