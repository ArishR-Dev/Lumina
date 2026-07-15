import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { EmptyState } from "@/components/lumina/EmptyState";
import { ReadingMode } from "@/components/lumina/ReadingMode";
import { useLumina } from "@/lib/lumina-store";

import { notify } from "@/lib/lumina-toasts";
import { Heart, X } from "lucide-react";

export const Route = createFileRoute("/app/thoughts/")({ component: ThoughtsPage });

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ThoughtsPage() {
  const thoughts = useLumina((s) => s.thoughts);
  const addThought = useLumina((s) => s.addThought);
  const deleteThought = useLumina((s) => s.deleteThought);
  const toggleFavorite = useLumina((s) => s.toggleFavorite);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [readingId, setReadingId] = useState<string | null>(null);

  const capture = () => {
    const v = text.trim();
    if (!v) return;
    addThought(v, title.trim() || undefined);
    setText("");
    setTitle("");
    notify.created("Thought");
  };

  const reading = thoughts.find((t) => t.id === readingId) || null;

  const PROMPTS = [
    "One tiny thing you're grateful for right now",
    "A feeling you don't have words for yet",
    "Something you'd tell yourself yesterday",
    "A small win from today",
    "A person you're quietly missing",
  ];
  const TAG_SUGGESTIONS = ["✨ gratitude", "🌿 calm", "💭 wondering", "🌸 tender", "🔥 spark", "☕ ordinary"];

  const recent = thoughts.slice(0, 6);

  return (
    <div className="space-y-6 pb-24">
      <PageHeader eyebrow="just for a second" title="Thoughts" subtitle="Quick whispers, with a title to find them again." />

      <GlassCard>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give it a title…"
          className="w-full bg-transparent text-xl font-display outline-none placeholder:text-muted-foreground"
        />
        <div className="my-2 h-px w-full bg-white/40 dark:bg-white/10" />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) capture();
          }}
          placeholder="What's on your mind right now?"
          className="min-h-[120px] w-full resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">Cmd/Ctrl + Enter to capture</div>
          <button
            onClick={capture}
            className="inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] px-5 py-2.5 text-sm font-medium text-white shadow-md transition duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98]"
          >
            Capture
          </button>
        </div>

        {/* Inline tag suggestions — click to append to the thought text. */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/40 pt-3 dark:border-white/10">
          <span className="mr-1 self-center text-[10px] uppercase tracking-widest text-muted-foreground">
            add a mood
          </span>
          {TAG_SUGGESTIONS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setText((t) => (t.trim() ? `${t} ${tag}` : tag))}
              className="rounded-full border border-white/60 bg-white/60 px-2.5 py-1 text-[11px] text-foreground/80 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/80 active:translate-y-0 active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              {tag}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Recent thoughts + inspiration prompts */}
      {thoughts.length === 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <EmptyState
              emoji="💭"
              title="Nothing captured yet"
              message="Even the smallest thought is welcome here — jot one down above, or start from a gentle prompt."
            />
          </div>
          <GlassCard className="!p-5">
            <div className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">writing prompts</div>
            <ul className="space-y-2">
              {PROMPTS.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => { setTitle(p); }}
                    className="w-full rounded-2xl border border-white/60 bg-white/50 px-3 py-2.5 text-left text-sm leading-snug text-foreground/80 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white/80 active:translate-y-0 active:scale-[0.99] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>
      ) : (
        <>
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Recent thoughts</h2>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {thoughts.length} {thoughts.length === 1 ? "note" : "notes"}
            </span>
          </div>
          <div className="lumina-virtual-list columns-1 gap-5 sm:columns-2 lg:columns-3">
            <AnimatePresence>
              {recent.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="glass group relative mb-5 break-inside-avoid rounded-3xl p-5"
                >
                  <button
                    type="button"
                    onClick={() => setReadingId(t.id)}
                    className="block w-full cursor-pointer text-left"
                    aria-label={`Open ${t.title || "thought"} in reading mode`}
                  >
                    <h3 className="line-clamp-2 pr-24 font-display text-lg leading-snug">
                      {t.title || "Untitled thought"}
                    </h3>
                    <div className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {new Date(t.createdAt).toLocaleString()}
                    </div>
                  </button>
                  <div className="absolute right-3 top-3 flex shrink-0 items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const was = !!t.favorite;
                        toggleFavorite("thought", t.id);
                        notify.favorited(!was);
                      }}
                      aria-label={t.favorite ? "Unfavorite" : "Favorite"}
                      aria-pressed={!!t.favorite}
                      className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition hover:bg-white/50 hover:text-[oklch(0.7_0.2_20)] dark:hover:bg-white/10"
                    >
                      <Heart className={t.favorite ? "h-4 w-4 fill-[oklch(0.7_0.2_20)] text-[oklch(0.7_0.2_20)]" : "h-4 w-4"} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteThought(t.id);
                        notify.deleted("Thought");
                      }}
                      aria-label="Delete thought"
                      className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition hover:bg-white/50 hover:text-destructive dark:hover:bg-white/10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Writing inspiration — always visible, gently understated. */}
          <GlassCard className="!p-5">
            <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              <span>a little inspiration</span>
              <span className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
            </div>
            <div className="flex flex-wrap gap-2">
              {PROMPTS.slice(0, 4).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setTitle(p); }}
                  className="rounded-full border border-white/60 bg-white/50 px-3.5 py-1.5 text-xs text-foreground/80 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/80 active:translate-y-0 active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  {p}
                </button>
              ))}
            </div>
          </GlassCard>
        </>
      )}

      <ReadingMode
        open={!!reading}
        onClose={() => setReadingId(null)}
        title={reading?.title || "A passing thought"}
        content={reading ? `<p>${escapeHtml(reading.text).replace(/\n/g, "<br/>")}</p>` : ""}
        meta="Thought"
      />
    </div>
  );
}
