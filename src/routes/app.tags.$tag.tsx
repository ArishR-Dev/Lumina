import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { useLumina } from "@/lib/lumina-store";
import { stripHtml } from "@/lib/lumina-timeline";

export const Route = createFileRoute("/app/tags/$tag")({
  component: TagPage,
});

/**
 * Universal tag page. Aggregates every tagged entity across Lumina.
 *
 * NOTE: In the current data model only Notes and Tasks carry `tags[]`.
 * Journal / Thought / Letter / Memory / Capsule / Habit are structured
 * around other axes (date, mood, cover, etc.) and don't accept tags.
 * The scaffolding here is future-proof — the moment any of those entity
 * types grow a `tags: string[]` field, add a section below and it will
 * light up automatically.
 */
function TagPage() {
  const { tag } = Route.useParams();
  const notes = useLumina((s) => s.notes);
  const tasks = useLumina((s) => s.tasks);

  const hits = useMemo(() => {
    const t = tag.toLowerCase();
    const has = (xs: string[] | undefined) => (xs ?? []).some((x) => x.toLowerCase() === t);
    return {
      notes: notes.filter((n) => !n.trashed && has(n.tags)),
      tasks: tasks.filter((tk) => has(tk.tags)),
    };
  }, [notes, tasks, tag]);

  const total = hits.notes.length + hits.tasks.length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="tagged"
        title={`#${tag}`}
        subtitle={total === 0
          ? "Nothing here yet — tag notes or tasks with this word to gather them."
          : `${total} item${total === 1 ? "" : "s"} gathered here.`}
      />

      {total === 0 ? (
        <GlassCard className="grid place-items-center py-16 text-center text-muted-foreground">
          <div>
            <p className="mb-3">No entries with this tag yet.</p>
            <Link to="/app/notes" className="text-xs uppercase tracking-[0.24em] text-primary hover:underline">
              Write your first tagged note →
            </Link>
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-6">
          {hits.notes.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Notes · {hits.notes.length}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {hits.notes.map((n) => (
                  <li key={n.id}>
                    <Link
                      to="/app/notes/$id"
                      params={{ id: n.id }}
                      className="glass block rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <div className="truncate font-medium">{n.title || "Untitled"}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {stripHtml(n.content).slice(0, 140) || "—"}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hits.tasks.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Tasks · {hits.tasks.length}
              </h2>
              <ul className="space-y-2">
                {hits.tasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      to="/app/tasks/$id"
                      params={{ id: t.id }}
                      className="glass block rounded-2xl p-3 transition hover:-translate-y-0.5"
                    >
                      <span className={t.done ? "line-through text-muted-foreground" : ""}>{t.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
