import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gift, Heart, Lock, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { EmptyState } from "@/components/lumina/EmptyState";
import { useLumina, type Capsule } from "@/lib/lumina-store";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/capsules/")({ component: CapsulesPage });

const PRESETS: { label: string; days: number }[] = [
  { label: "1 month", days: 30 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
  { label: "New Year's Day", days: -1 },
];

const COVERS = ["🌸", "💌", "🌙", "✨", "🌿", "🦋", "🌊", "☀️"];

function nextNewYear(from = new Date()) {
  const d = new Date(from.getFullYear() + 1, 0, 1, 9, 0, 0, 0);
  return d.getTime();
}

function CapsulesPage() {
  const capsules = useLumina((s) => s.capsules);
  const addCapsule = useLumina((s) => s.addCapsule);
  const openCapsule = useLumina((s) => s.openCapsule);
  const deleteCapsule = useLumina((s) => s.deleteCapsule);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [cover, setCover] = useState("🌸");
  const [days, setDays] = useState<number>(30);
  const [customDate, setCustomDate] = useState("");
  


  const now = Date.now();
  const sealed = useMemo(() => capsules.filter((c) => !c.opened && c.unlockAt > now), [capsules, now]);
  const ready = useMemo(() => capsules.filter((c) => !c.opened && c.unlockAt <= now), [capsules, now]);
  const opened = useMemo(() => capsules.filter((c) => c.opened), [capsules]);

  const save = () => {
    if (!message.trim()) {
      toast.error("A capsule needs a little message.");
      return;
    }
    let unlockAt = now;
    if (customDate) {
      unlockAt = new Date(customDate + "T09:00:00").getTime();
    } else if (days === -1) {
      unlockAt = nextNewYear();
    } else {
      unlockAt = now + days * 86_400_000;
    }
    if (unlockAt <= now) {
      toast.error("Please pick a date in the future.");
      return;
    }
    addCapsule({ title: title.trim() || "A note to future you", message: message.trim(), unlockAt, cover });
    setTitle("");
    setMessage("");
    setCustomDate("");
    toast.success("Capsule sealed 🌸");
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="little letters to your future self"
        title="Memory Capsules"
        subtitle="Seal a message today. Open it later, when you'll need it most."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {ready.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> ready to open · {ready.length}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {ready.map((c) => (
                  <CapsuleCard
                    key={c.id}
                    c={c}
                    state="ready"
                    onOpen={() => {
                      openCapsule(c.id);
                      toast.success("Capsule opened", {
                        description: c.title || "A little memory kept for later — now yours to keep.",
                      });
                    }}
                    onDelete={() => deleteCapsule(c.id)}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> sealed · {sealed.length}
            </h3>
            {sealed.length === 0 ? (
              <EmptyState
                emoji="💌"
                title="No sealed capsules yet"
                message="Write a little note to your future self — it'll be waiting when the day arrives."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {sealed.map((c) => (
                  <CapsuleCard key={c.id} c={c} state="sealed" onDelete={() => deleteCapsule(c.id)} />
                ))}
              </div>
            )}
          </section>

          {opened.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <Gift className="h-3.5 w-3.5" /> opened · {opened.length}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {opened.map((c) => (
                  <CapsuleCard key={c.id} c={c} state="opened" onDelete={() => deleteCapsule(c.id)} />
                ))}
              </div>
            </section>
          )}
        </div>

        <GlassCard className="h-fit">
          <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Seal a new capsule</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="mt-4 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-2 text-sm outline-none focus:border-primary/50 dark:border-white/10 dark:bg-white/5"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Dear future me…"
            rows={6}
            className="mt-3 w-full resize-none rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-sm outline-none focus:border-primary/50 dark:border-white/10 dark:bg-white/5"
          />
          <div className="mt-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Cover</div>
            <div className="flex flex-wrap gap-1.5">
              {COVERS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setCover(e)}
                  aria-label={`Choose cover ${e}`}
                  className={cn(
                    "grid h-11 w-11 place-items-center rounded-2xl text-xl transition sm:h-10 sm:w-10 sm:text-lg",
                    cover === e ? "bg-primary/20 shadow-inner" : "bg-white/60 hover:bg-white/80 dark:bg-white/5",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Unlock in</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setDays(p.days); setCustomDate(""); }}
                  className={cn(
                    "min-h-11 rounded-full px-4 py-2.5 text-xs transition",
                    !customDate && days === p.days
                      ? "bg-primary/20 text-foreground"
                      : "bg-white/60 text-muted-foreground hover:bg-white/80 dark:bg-white/5",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={customDate}
              min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
              onChange={(e) => setCustomDate(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-2 text-sm outline-none focus:border-primary/50 dark:border-white/10 dark:bg-white/5"
            />
          </div>
          <button
            onClick={save}
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] px-5 text-sm font-medium text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:shadow-lg hover:brightness-105 active:translate-y-0 active:scale-[0.98]"
          >
            Seal capsule
          </button>
        </GlassCard>
      </div>
    </div>
  );
}

function CapsuleCard({
  c, state, onOpen, onDelete,
}: {
  c: Capsule;
  state: "sealed" | "ready" | "opened";
  onOpen?: () => void;
  onDelete: () => void;
}) {
  const toggleFavorite = useLumina((s) => s.toggleFavorite);
  const [opening, setOpening] = useState(false);
  const remaining = c.unlockAt - Date.now();
  const daysLeft = Math.max(0, Math.ceil(remaining / 86_400_000));

  const handleOpen = () => {
    if (!onOpen) return;
    setOpening(true);
    setTimeout(() => onOpen(), 900);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass group relative overflow-hidden rounded-3xl p-5"
    >
      <div className="absolute right-3 top-3 flex gap-1">
        <button
          onClick={() => toggleFavorite("capsule", c.id)}
          aria-label={c.favorite ? "Unfavorite" : "Favorite"}
          aria-pressed={!!c.favorite}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/40 text-muted-foreground transition hover:text-[oklch(0.7_0.2_20)] dark:bg-white/5"
        >
          <Heart className={c.favorite ? "h-4 w-4 fill-[oklch(0.7_0.2_20)] text-[oklch(0.7_0.2_20)]" : "h-4 w-4"} />
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete capsule"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/40 text-muted-foreground transition hover:text-destructive md:opacity-0 md:group-hover:opacity-100 dark:bg-white/5"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <AnimatePresence mode="wait">
        {state !== "opened" && !opening ? (
          <motion.div
            key="sealed"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9, rotate: -6 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center py-4 text-center"
          >
            <div
              className={cn(
                "grid h-28 w-28 place-items-center rounded-full text-5xl shadow-inner",
                state === "ready"
                  ? "bg-gradient-to-br from-[oklch(0.9_0.13_340)] to-[oklch(0.85_0.12_290)] animate-pulse"
                  : "bg-gradient-to-br from-white/70 to-white/30 dark:from-white/10 dark:to-white/5",
              )}
            >
              <span aria-hidden>{c.cover ?? "💌"}</span>
            </div>
            <div className="mt-4 font-display text-xl">{c.title}</div>
            {state === "sealed" ? (
              <>
                <div className="mt-1 text-xs text-muted-foreground">
                  Sealed · opens {new Date(c.unlockAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                </div>
                <div className="mt-2 rounded-full bg-white/60 px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground dark:bg-white/5">
                  {daysLeft} {daysLeft === 1 ? "day" : "days"} to go
                </div>
              </>
            ) : (
              <>
                <div className="mt-1 text-xs text-muted-foreground">Ready to open</div>
                <button
                  onClick={handleOpen}
                  className="mt-4 rounded-full bg-primary/90 px-5 py-2 text-xs font-medium text-primary-foreground shadow-sm transition hover:scale-[1.03] hover:bg-primary"
                >
                  Open now ✨
                </button>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="opened"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="py-2"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/60 text-2xl dark:bg-white/5">
                {c.cover ?? "💌"}
              </div>
              <div className="min-w-0">
                <div className="truncate font-display text-lg">{c.title}</div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Sealed {new Date(c.createdAt).toLocaleDateString()} · opened {new Date(c.unlockAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap font-hand text-lg leading-relaxed text-foreground">
              {c.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}