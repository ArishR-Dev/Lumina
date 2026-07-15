import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, Mail, Plus, X, Save, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { useLumina, type Letter } from "@/lib/lumina-store";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/letters")({ component: LettersPage });

/* -------------------------------------------------------------------------- *
 * Letters — premium stationery experience.
 *
 * The list stays a light board of envelope tiles.  Selecting or writing a
 * letter opens a full-viewport theatre: the envelope glides to centre, the
 * flap unfolds, and the paper slides upward with the writing fading in line
 * by line.  Closing reverses the sequence so nothing ever pops.
 *
 * Everything is memoised and transform/opacity-only.  A single stateful
 * "stage" object owns the current view (list | open | compose) so the tile
 * grid never re-renders while a letter is being read or written.
 * -------------------------------------------------------------------------- */

type Stage =
  | { kind: "list" }
  | { kind: "open"; id: string }
  | { kind: "compose"; id?: string };

const OPEN_MS = 780; // total open animation
const PAPER_TINT = "#f7f1e3"; // ivory cotton paper

function LettersPage() {
  const letters = useLumina((s) => s.letters);
  const addLetter = useLumina((s) => s.addLetter);
  const updateLetter = useLumina((s) => s.updateLetter);

  const [stage, setStage] = useState<Stage>({ kind: "list" });



  const open = useCallback((id: string) => setStage({ kind: "open", id }), []);
  const close = useCallback(() => setStage({ kind: "list" }), []);
  const compose = useCallback(() => setStage({ kind: "compose" }), []);

  const activeLetter = stage.kind === "open" ? letters.find((l) => l.id === stage.id) ?? null : null;

  // Keyboard: Esc closes stage overlays.
  useEffect(() => {
    if (stage.kind === "list") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage.kind, close]);

  return (
    <div className="relative space-y-6">
      <PageHeader
        eyebrow="sealed with care"
        title="Letters"
        subtitle="Little envelopes to yourself and the people you cherish."
        actions={
          <button
            onClick={compose}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] px-5 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg transition-shadow"
          >
            <Plus className="h-4 w-4" /> Write a letter
          </button>
        }
      />

      {letters.length === 0 ? (
        <GlassCard className="py-20 text-center">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
            <Mail className="h-8 w-8 opacity-60" />
            <p>No letters yet — write your very first one.</p>
            <button
              onClick={compose}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-white/70 px-5 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-white dark:bg-white/10"
            >
              <Plus className="h-4 w-4" /> Begin
            </button>
          </div>
        </GlassCard>
      ) : (
        <EnvelopeBoard
          letters={letters}
          onOpen={open}
          onFav={(id, fav) => updateLetter(id, { favorite: !fav })}
        />
      )}

      <AnimatePresence>
        {stage.kind === "open" && activeLetter && (
          <LetterTheatre
            key={activeLetter.id}
            letter={activeLetter}
            onClose={close}
            onEdit={() => setStage({ kind: "compose", id: activeLetter.id })}
            onFav={() => updateLetter(activeLetter.id, { favorite: !activeLetter.favorite })}
          />
        )}
        {stage.kind === "compose" && (
          <ComposeTheatre
            key={stage.id ?? "new"}
            letter={stage.id ? letters.find((l) => l.id === stage.id) : undefined}
            onClose={close}
            onSave={({ to, from, body }) => {
              if (!body.trim()) {
                close();
                return;
              }
              try {
                if (stage.id) {
                  updateLetter(stage.id, { to, from, body });
                } else {
                  addLetter({ to, from, body });
                }
                toast.success("Letter safely tucked away.", { icon: "✉️" });
                close();
              } catch (err) {
                console.error("[Letters] Save failed", err);
                toast.error(
                  err instanceof Error && err.message
                    ? `Couldn't save: ${err.message}`
                    : "Couldn't save the letter. Please try again.",
                );
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * Envelope board — staggered stationery gallery
 * -------------------------------------------------------------------------- */

type BoardProps = {
  letters: Letter[];
  onOpen: (id: string) => void;
  onFav: (id: string, fav: boolean) => void;
};

const EnvelopeBoard = memo(function EnvelopeBoard({ letters, onOpen, onFav }: BoardProps) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {letters.map((l, i) => (
        <EnvelopeTile
          key={l.id}
          letter={l}
          index={i}
          onOpen={onOpen}
          onFav={onFav}
        />
      ))}
    </div>
  );
});

type TileProps = {
  letter: Letter;
  index: number;
  onOpen: (id: string) => void;
  onFav: (id: string, fav: boolean) => void;
};

const EnvelopeTile = memo(function EnvelopeTile({ letter, index, onOpen, onFav }: TileProps) {
  const reduce = useReducedMotion();
  // Deterministic tiny rotation per tile — staggered like envelopes on a board.
  const tilt = ((index * 37) % 5) - 2; // -2..+2 deg
  const drift = ((index * 53) % 6) - 3; // -3..+3 px

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? undefined : { opacity: 0, y: 12, rotate: tilt }}
      animate={reduce ? undefined : { opacity: 1, y: drift, rotate: tilt }}
      transition={{ duration: 0.5, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
      style={{ perspective: 1200 }}
      
    >
      <button
        type="button"
        onClick={() => onOpen(letter.id)}
        aria-label={`Open letter to ${letter.to || "you"}`}
        className={cn(
          "envelope-tile group relative block h-56 w-full cursor-pointer overflow-hidden rounded-2xl text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        )}
      >
        <EnvelopeArt letter={letter} sealed hoverEnabled />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onFav(letter.id, !!letter.favorite);
        }}
        aria-label={letter.favorite ? "Unfavourite letter" : "Favourite letter"}
        className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/80 shadow-sm backdrop-blur transition hover:bg-white"
      >
        <Heart
          className={cn(
            "h-4 w-4 transition",
            letter.favorite ? "fill-[oklch(0.7_0.2_20)] text-[oklch(0.7_0.2_20)]" : "text-muted-foreground",
          )}
        />
      </button>

      <QuickPreview letter={letter} />
    </motion.div>
  );
});

/* -------------------------------------------------------------------------- *
 * Envelope artwork — reused for tile, opening animation, and compose.
 *
 * Layers, back-to-front:
 *   body  — envelope back (paper texture + soft embossed border + vignette)
 *   flap  — triangular top flap (rotates on X axis when opening)
 *   seal  — small wax dot at the tip of the flap
 * -------------------------------------------------------------------------- */

type EnvelopeArtProps = {
  letter: Pick<Letter, "to" | "createdAt">;
  sealed: boolean;
  hoverEnabled?: boolean;
  className?: string;
};

const EnvelopeArt = memo(function EnvelopeArt({
  letter,
  sealed,
  hoverEnabled,
  className,
}: EnvelopeArtProps) {
  return (
    <div className={cn("envelope-body relative h-full w-full", className)}>
      {/* paper body */}
      <div className="envelope-paper absolute inset-0 rounded-2xl" />
      {/* subtle vignette + grain */}
      <div className="envelope-grain absolute inset-0 rounded-2xl mix-blend-multiply opacity-40" />
      {/* embossed border */}
      <div className="pointer-events-none absolute inset-1 rounded-xl border border-[oklch(0.75_0.05_60_/_0.5)]" />

      {/* recipient */}
      <div className="absolute inset-x-5 top-5">
        <div className="text-[10px] uppercase tracking-[0.28em] text-[oklch(0.5_0.05_40)]">to</div>
        <div className="font-display text-2xl text-[oklch(0.32_0.05_40)]">
          {letter.to || "you"}
        </div>
      </div>

      {/* date */}
      <div className="absolute bottom-4 left-5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-[oklch(0.45_0.05_40)]">
        <Mail className="h-3 w-3" /> {new Date(letter.createdAt).toLocaleDateString()}
      </div>

      {/* flap */}
      <motion.div
        aria-hidden
        initial={false}
        animate={{ rotateX: sealed ? 0 : -180 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: "top center", transformStyle: "preserve-3d" }}
        className="absolute inset-x-0 top-0 h-1/2"
      >
        <div className="envelope-flap h-full w-full" />
        {sealed && (
          <div className="wax-seal absolute left-1/2 top-[calc(100%-14px)] -translate-x-1/2" aria-hidden />
        )}
      </motion.div>

      {/* light sweep on hover */}
      {hoverEnabled && <div className="envelope-sweep pointer-events-none absolute inset-0 rounded-2xl overflow-hidden" />}
    </div>
  );
});

/* -------------------------------------------------------------------------- *
 * Quick preview (hover on desktop, long-press on mobile)
 * -------------------------------------------------------------------------- */

const QuickPreview = memo(function QuickPreview({ letter }: { letter: Letter }) {
  const preview = useMemo(() => {
    const lines = letter.body
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3);
    return lines.join(" ").slice(0, 160);
  }, [letter.body]);

  if (!preview) return null;

  return (
    <div className="quick-preview pointer-events-none absolute inset-x-2 top-full z-20 mt-2 opacity-0">
      <div className="glass rounded-2xl border border-white/60 p-3 text-xs shadow-lg dark:border-white/10">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>to {letter.to || "you"}</span>
          <span>·</span>
          <span>{new Date(letter.createdAt).toLocaleDateString()}</span>
        </div>
        <p className="line-clamp-3 font-hand text-base leading-snug text-foreground/85">{preview}</p>
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- *
 * LetterTheatre — full-viewport reading experience with cinematic sequence.
 * -------------------------------------------------------------------------- */

type TheatreProps = {
  letter: Letter;
  onClose: () => void;
  onEdit: () => void;
  onFav: () => void;
};

function LetterTheatre({ letter, onClose, onEdit, onFav }: TheatreProps) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"sealed" | "opening" | "open" | "closing">("sealed");

  // Choreograph the open sequence: sealed → opening (flap) → open (paper slides up)
  useEffect(() => {
    if (reduce) {
      setPhase("open");
      return;
    }
    const t1 = setTimeout(() => setPhase("opening"), 60);
    const t2 = setTimeout(() => setPhase("open"), OPEN_MS * 0.55);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [reduce]);

  const closeSeq = useCallback(() => {
    if (reduce) {
      onClose();
      return;
    }
    setPhase("closing");
    // Wait for reverse sequence then unmount.
    setTimeout(onClose, OPEN_MS * 0.75);
  }, [reduce, onClose]);

  const flapOpen = phase === "opening" || phase === "open";
  const paperOut = phase === "open";

  const lines = useMemo(
    () => letter.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    [letter.body],
  );

  return (
    <motion.div
      className="lumina-modal fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Letter to ${letter.to || "you"}`}
    >
      {/* backdrop with warm vignette + slow-drifting dust */}
      <button
        type="button"
        aria-label="Close letter"
        onClick={closeSeq}
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
      />
      <AmbientDust />

      {/* Mobile: sticky action header (no floating overlaps). Desktop: floats above envelope. */}
      <div
        className="pointer-events-auto sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-3 py-2 backdrop-blur-md sm:hidden"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={closeSeq}
          aria-label="Back"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/85 px-4 text-sm font-medium text-foreground/80 shadow-sm active:scale-[0.98]"
        >
          <X className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFav}
            aria-label={letter.favorite ? "Unfavourite" : "Favourite"}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/85 shadow-sm active:scale-[0.98]"
          >
            <Heart
              className={cn(
                "h-4 w-4",
                letter.favorite ? "fill-[oklch(0.7_0.2_20)] text-[oklch(0.7_0.2_20)]" : "text-muted-foreground",
              )}
            />
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit letter"
            className="grid h-11 w-11 place-items-center rounded-full bg-white/85 shadow-sm active:scale-[0.98]"
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <motion.div
        className="relative z-10 mx-auto flex w-full flex-1 items-stretch justify-center px-3 pb-4 pt-2 sm:max-w-2xl sm:flex-none sm:items-center sm:p-0"
        style={{ perspective: 1600, paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        initial={{ scale: 0.88, y: 20 }}
        animate={{ scale: phase === "closing" ? 0.9 : 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative flex w-full flex-1 flex-col sm:block">
          {/* Desktop actions — kept floating above the envelope */}
          <div className="absolute -top-12 right-0 z-20 hidden items-center gap-2 sm:flex">
            <button
              onClick={onFav}
              aria-label={letter.favorite ? "Unfavourite" : "Favourite"}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/80 shadow-sm hover:bg-white"
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  letter.favorite ? "fill-[oklch(0.7_0.2_20)] text-[oklch(0.7_0.2_20)]" : "text-muted-foreground",
                )}
              />
            </button>
            <button
              onClick={onEdit}
              aria-label="Edit letter"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/80 shadow-sm hover:bg-white"
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={closeSeq}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/80 shadow-sm hover:bg-white"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Envelope + paper: on mobile the whole stack fills the viewport;
              on desktop we keep the framed envelope aspect ratio. */}
          <div className="relative mx-auto flex w-full flex-1 sm:block sm:aspect-[4/2.6] sm:w-full">
            <div className="pointer-events-none absolute inset-0 hidden sm:block">
              <EnvelopeShell flapOpen={flapOpen} />
            </div>

            {/* Paper that slides upward out of the envelope */}
            <motion.div
              aria-hidden={!paperOut}
              initial={false}
              animate={{
                y: paperOut ? (reduce ? 0 : "-4%") : "12%",
                scale: paperOut ? 1 : 0.94,
                opacity: phase === "sealed" ? 0 : 1,
              }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 flex w-full flex-1 sm:absolute sm:inset-x-6 sm:top-4 sm:bottom-4 sm:flex-none"
              style={{ willChange: "transform, opacity" }}
            >
              <PaperSheet letter={letter} lines={lines} reveal={paperOut} />
            </motion.div>
          </div>
        </div>
      </motion.div>

    </motion.div>
  );
}


/* -------------------------------------------------------------------------- *
 * ComposeTheatre — same envelope-opens flow, but reveals the editor.
 * -------------------------------------------------------------------------- */

type ComposeProps = {
  letter?: Letter;
  onClose: () => void;
  onSave: (v: { to: string; from: string; body: string }) => void;
};

function ComposeTheatre({ letter, onClose, onSave }: ComposeProps) {
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState({
    to: letter?.to ?? "",
    from: letter?.from ?? "",
    body: letter?.body ?? "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(() => {
    if (saving) return;
    if (!draft.body.trim()) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      onSave(draft);
    } finally {
      // If parent didn't unmount us (error path), re-enable after a beat.
      setTimeout(() => setSaving(false), 800);
    }
  }, [draft, onSave, onClose, saving]);

  return (
    <motion.div
      className="lumina-modal fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="dialog"
      aria-modal="true"
      aria-label={letter ? "Edit letter" : "Write a letter"}
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-md"
      />
      {!reduce && <AmbientDust />}

      <motion.div
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden bg-transparent",
          "h-[100dvh] sm:h-auto sm:max-h-[95dvh] sm:max-w-2xl sm:rounded-3xl",
        )}
        initial={reduce ? undefined : { scale: 0.94, y: 24, opacity: 0 }}
        animate={reduce ? undefined : { scale: 1, y: 0, opacity: 1 }}
        exit={reduce ? undefined : { scale: 0.96, y: 12, opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Sticky header */}
        <div
          className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-black/30 px-4 py-3 backdrop-blur-md"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full bg-white/85 px-4 text-sm font-medium text-foreground/80 shadow-sm hover:bg-white"
          >
            Cancel
          </button>
          <div className="pointer-events-none hidden items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-white/70 sm:flex">
            <Sparkles className="h-3 w-3" />
            {letter ? "Edit letter" : "New letter"}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !draft.body.trim()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] px-4 text-sm font-medium text-white shadow-md transition disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Seal & keep
          </button>
        </div>

        {/* Paper — fills the sheet; min-h-0 so textarea flex works with keyboard */}
        <div className="relative flex min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
          <div className="mx-auto flex min-h-full w-full max-w-xl">
            <PaperEditor
              draft={draft}
              onChange={setDraft}
              disabled={saving}
            />
          </div>
        </div>


        {/* Sticky footer hint on mobile */}
        <div
          className="sticky bottom-0 z-20 flex items-center justify-center gap-2 border-t border-white/10 bg-black/30 px-4 py-2 text-[11px] text-white/75 backdrop-blur-md sm:hidden"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          <span className="font-hand text-base">Write as if the paper were between your fingers.</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- *
 * Envelope shell — used inside theatres (larger, with unfolding flap).
 * -------------------------------------------------------------------------- */

const EnvelopeShell = memo(function EnvelopeShell({
  flapOpen,
  sealing = false,
}: {
  flapOpen: boolean;
  sealing?: boolean;
}) {
  return (
    <div className="relative h-full w-full">
      <div className="envelope-paper lumina-elev-4 absolute inset-0 rounded-3xl" />
      <div className="envelope-grain absolute inset-0 rounded-3xl mix-blend-multiply opacity-40" />
      <div className="pointer-events-none absolute inset-2 rounded-2xl border border-[oklch(0.75_0.05_60_/_0.5)]" />
      <motion.div
        aria-hidden
        initial={false}
        animate={{ rotateX: flapOpen ? -178 : 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: "top center", transformStyle: "preserve-3d" }}
        className="absolute inset-x-0 top-0 h-1/2 z-20"
      >
        <div className="envelope-flap h-full w-full" />
        {(!flapOpen || sealing) && (
          <div
            className={cn(
              "wax-seal absolute left-1/2 top-[calc(100%-18px)] -translate-x-1/2",
              sealing && "wax-stamp",
            )}
            aria-hidden
          />
        )}
      </motion.div>
    </div>
  );
});

/* -------------------------------------------------------------------------- *
 * Paper sheet — read-only display with staggered line reveal.
 * -------------------------------------------------------------------------- */

type PaperSheetProps = {
  letter: Letter;
  lines: string[];
  reveal: boolean;
};

const PaperSheet = memo(function PaperSheet({ letter, lines, reveal }: PaperSheetProps) {
  return (
    <div className="paper-sheet lumina-elev-3 relative flex h-full w-full flex-col overflow-hidden rounded-2xl px-8 py-6">

      <div className="flex items-baseline justify-between border-b border-[oklch(0.75_0.05_60_/_0.4)] pb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[oklch(0.5_0.05_40)]">Dearest</div>
          <div className="font-display text-2xl text-[oklch(0.28_0.05_40)]">{letter.to || "you"}</div>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[oklch(0.5_0.05_40)]">
          {new Date(letter.createdAt).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pr-2 space-y-3">
        {lines.length === 0 && (
          <p className="font-hand text-2xl leading-relaxed text-[oklch(0.35_0.05_40)]">
            An empty page, waiting for words.
          </p>
        )}
        {lines.map((p, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: reveal ? 1 : 0, y: reveal ? 0 : 6 }}
            transition={{ duration: 0.5, delay: reveal ? 0.08 + i * 0.12 : 0, ease: "easeOut" }}
            className="font-hand text-2xl leading-relaxed text-[oklch(0.25_0.06_40)]"
          >
            {p}
          </motion.p>
        ))}
      </div>

      {letter.from && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: reveal ? 1 : 0 }}
          transition={{ delay: 0.12 + lines.length * 0.12, duration: 0.4 }}
          className="mt-4 text-right font-hand text-xl text-[oklch(0.4_0.06_40)]"
        >
          — {letter.from}
        </motion.div>
      )}
    </div>
  );
});

/* -------------------------------------------------------------------------- *
 * Paper editor — same paper look, editable inputs.
 * -------------------------------------------------------------------------- */

type PaperEditorProps = {
  draft: { to: string; from: string; body: string };
  onChange: (v: { to: string; from: string; body: string }) => void;
  disabled: boolean;
};

const PaperEditor = memo(function PaperEditor({ draft, onChange, disabled }: PaperEditorProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!disabled) bodyRef.current?.focus();
  }, [disabled]);

  // Keep the caret visible above the on-screen keyboard.
  const keepCaretVisible = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    // Defer to next frame so the keyboard layout has settled.
    requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch {
        el.scrollIntoView();
      }
    });
  }, []);

  return (
    <div className="paper-sheet lumina-elev-3 relative flex h-full w-full flex-col overflow-hidden rounded-2xl px-8 py-6">
      <div className="grid grid-cols-2 gap-3 border-b border-[oklch(0.75_0.05_60_/_0.4)] pb-3">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.28em] text-[oklch(0.5_0.05_40)]">to</span>
          <input
            value={draft.to}
            onChange={(e) => onChange({ ...draft, to: e.target.value })}
            onFocus={keepCaretVisible}
            placeholder="dear friend"
            disabled={disabled}
            className="mt-1 w-full border-0 bg-transparent font-display text-xl text-[oklch(0.28_0.05_40)] outline-none placeholder:text-[oklch(0.6_0.03_40)]"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.28em] text-[oklch(0.5_0.05_40)]">from</span>
          <input
            value={draft.from}
            onChange={(e) => onChange({ ...draft, from: e.target.value })}
            onFocus={keepCaretVisible}
            placeholder="you"
            disabled={disabled}
            className="mt-1 w-full border-0 bg-transparent font-display text-xl text-[oklch(0.28_0.05_40)] outline-none placeholder:text-[oklch(0.6_0.03_40)]"
          />
        </label>
      </div>
      <textarea
        ref={bodyRef}
        value={draft.body}
        onChange={(e) => {
          onChange({ ...draft, body: e.target.value });
          keepCaretVisible();
        }}
        onFocus={keepCaretVisible}
        onKeyUp={keepCaretVisible}
        disabled={disabled}
        placeholder="Hey friend,&#10;&#10;There's something I've been meaning to say…"
        className="mt-3 flex-1 w-full resize-none border-0 bg-transparent font-hand text-2xl leading-relaxed text-[oklch(0.25_0.06_40)] outline-none placeholder:text-[oklch(0.55_0.03_40)]"
      />
    </div>
  );
});


/* -------------------------------------------------------------------------- *
 * Ambient dust / sunlight motes — subtle CSS-only particles behind envelope.
 * -------------------------------------------------------------------------- */

const AmbientDust = memo(function AmbientDust() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div aria-hidden className="ambient-dust pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} className={`dust dust-${(i % 7) + 1}`} />
      ))}
    </div>
  );
});
