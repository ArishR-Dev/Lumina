import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { EmptyState } from "@/components/lumina/EmptyState";
import { useLumina } from "@/lib/lumina-store";
import { Heart, StickyNote, BookHeart, MessageCircleHeart, Mail, Camera, CheckSquare, Gift } from "lucide-react";
import { stripHtml } from "@/lib/lumina-timeline";

export const Route = createFileRoute("/app/favorites")({ component: FavoritesPage });

function FavoritesPage() {
  const notes = useLumina((s) => s.notes);
  const journal = useLumina((s) => s.journal);
  const thoughts = useLumina((s) => s.thoughts);
  const letters = useLumina((s) => s.letters);
  const memories = useLumina((s) => s.memories);
  const tasks = useLumina((s) => s.tasks);
  const capsules = useLumina((s) => s.capsules);

  const favNotes = notes.filter((n) => n.favorite && !n.trashed);
  const favJournal = journal.filter((j) => j.favorite);
  const favThoughts = thoughts.filter((t) => t.favorite);
  const favLetters = letters.filter((l) => l.favorite);
  const favMemories = memories.filter((m) => m.favorite);
  const favTasks = tasks.filter((t) => t.favorite);
  const favCapsules = capsules.filter((c) => c.favorite);

  const total =
    favNotes.length + favJournal.length + favThoughts.length +
    favLetters.length + favMemories.length + favTasks.length + favCapsules.length;

  if (total === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="the ones that stay"
          title="Favorites"
          subtitle="The little pieces you cherish most."
        />
        <EmptyState
          emoji="🤍"
          title="Nothing kept yet"
          message="Tap the heart on any note, letter, memory, task, thought, journal entry, or capsule to keep it close."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="the ones that stay"
        title="Favorites"
        subtitle={`${total} treasured thing${total === 1 ? "" : "s"}.`}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {favNotes.length > 0 && (
          <FavGroup label="Notes" icon={<StickyNote className="h-4 w-4" />} count={favNotes.length}>
            {favNotes.map((n) => (
              <FavRow key={n.id} kind="note" id={n.id} title={n.title || "Untitled"} preview={stripHtml(n.content).slice(0, 90) || "—"} />
            ))}
          </FavGroup>
        )}

        {favJournal.length > 0 && (
          <FavGroup label="Journal" icon={<BookHeart className="h-4 w-4" />} count={favJournal.length}>
            {favJournal.map((j) => (
              <FavRow key={j.id} kind="journal" id={j.id}
                title={new Date(j.date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                preview={(j.gratitude || j.reflection || j.highlight || "").slice(0, 90) || "—"} />
            ))}
          </FavGroup>
        )}

        {favLetters.length > 0 && (
          <FavGroup label="Letters" icon={<Mail className="h-4 w-4" />} count={favLetters.length}>
            {favLetters.map((l) => (
              <FavRow key={l.id} kind="letter" id={l.id} title={`To ${l.to || "someone"}`} preview={l.body.slice(0, 90) || "—"} />
            ))}
          </FavGroup>
        )}

        {favMemories.length > 0 && (
          <FavGroup label="Memories" icon={<Camera className="h-4 w-4" />} count={favMemories.length}>
            {favMemories.map((m) => (
              <FavRow key={m.id} kind="memory" id={m.id} title={m.caption || "A little memory"} preview={m.album ?? ""} />
            ))}
          </FavGroup>
        )}

        {favThoughts.length > 0 && (
          <FavGroup label="Thoughts" icon={<MessageCircleHeart className="h-4 w-4" />} count={favThoughts.length}>
            {favThoughts.map((t) => (
              <FavRow key={t.id} kind="thought" id={t.id} title={t.text.slice(0, 60) || "Thought"} preview={new Date(t.createdAt).toLocaleDateString()} />
            ))}
          </FavGroup>
        )}

        {favTasks.length > 0 && (
          <FavGroup label="Tasks" icon={<CheckSquare className="h-4 w-4" />} count={favTasks.length}>
            {favTasks.map((t) => (
              <FavRow key={t.id} kind="task" id={t.id} title={t.text} preview={t.done ? "done" : "in progress"} />
            ))}
          </FavGroup>
        )}

        {favCapsules.length > 0 && (
          <FavGroup label="Capsules" icon={<Gift className="h-4 w-4" />} count={favCapsules.length}>
            {favCapsules.map((c) => (
              <FavRow key={c.id} kind="capsule" id={c.id} title={c.title || "A capsule"} preview={c.message.slice(0, 90) || "—"} />
            ))}
          </FavGroup>
        )}
      </div>
    </div>
  );
}

function FavGroup({ label, icon, count, children }: {
  label: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <GlassCard>
      <h3 className="mb-3 flex items-center justify-between font-display text-2xl">
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/60 text-primary dark:bg-white/10">
            {icon}
          </span>
          {label}
        </span>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          {count}
        </span>
      </h3>
      <ul className="space-y-2">{children}</ul>
    </GlassCard>
  );
}

const KIND_TO_ROUTE = {
  note: "/app/notes/$id",
  journal: "/app/journal/$id",
  thought: "/app/thoughts/$id",
  letter: "/app/letters/$id",
  memory: "/app/memories/$id",
  task: "/app/tasks/$id",
  capsule: "/app/capsules/$id",
} as const;

function FavRow({
  kind, id, title, preview,
}: {
  kind: keyof typeof KIND_TO_ROUTE;
  id: string;
  title: string;
  preview: string;
}) {
  return (
    <li>
      <Link
        to={KIND_TO_ROUTE[kind]}
        params={{ id }}
        className="flex items-center gap-3 rounded-2xl bg-white/50 p-3 text-sm transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 dark:bg-white/5 dark:hover:bg-white/10"
      >
        <Heart className="h-3.5 w-3.5 shrink-0 fill-[oklch(0.7_0.2_20)] text-[oklch(0.7_0.2_20)]" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          {preview && <div className="truncate text-xs text-muted-foreground">{preview}</div>}
        </div>
      </Link>
    </li>
  );
}
