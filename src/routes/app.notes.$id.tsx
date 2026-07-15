import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ArrowLeft, BookOpen, Copy, Expand, Heart, History,
  Maximize2, MoreHorizontal, Pin, RotateCcw, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RichEditor } from "@/components/lumina/RichEditor";
import { FocusMode } from "@/components/lumina/FocusMode";
import { ReadingMode } from "@/components/lumina/ReadingMode";
import { WritingAtmosphere } from "@/components/lumina/WritingAtmosphere";
import { useLumina, type Note } from "@/lib/lumina-store";
import { stripHtml, wordsFromHtml } from "@/lib/lumina-timeline";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/notes/$id")({ component: NoteEditorRoute });

// Time-of-day greetings and writing prompts for the note letterhead. Each
// bucket carries a handful of variants so the experience stays fresh — one
// is chosen per editing session and stays stable while the user writes.
const GREETINGS = {
  morning: ["Good morning.", "A fresh page.", "Soft start.", "Morning light."],
  afternoon: ["Slow down.", "A quiet pause.", "Midday breath.", "Good afternoon."],
  evening: ["Good evening.", "The day softens.", "Evening hush.", "Wind down."],
  night: ["Quiet hours.", "Late thoughts.", "The house is still.", "Softly, then."],
  midnight: [
    "Still awake?",
    "The hour is honest.",
    "No one's listening but the page.",
    "Late, late.",
    "Some nights ask to be written.",
  ],
} as const;

const PROMPTS = {
  morning: [
    "What's one thing you're looking forward to today?",
    "What do you want to carry into the day?",
    "Name one small hope.",
    "What's asking for your attention first?",
  ],
  afternoon: [
    "Capture a moment before it slips away.",
    "What's shifted since morning?",
    "Notice one thing. Write it slowly.",
    "What deserves a second look?",
  ],
  evening: [
    "Leave today's thoughts here.",
    "What's the shape of the day now?",
    "One thing worth remembering.",
    "What are you setting down tonight?",
  ],
  night: [
    "This page is yours.",
    "Say the small true thing first.",
    "What lives quietly in you tonight?",
    "Begin anywhere. The page will meet you.",
  ],
  midnight: [
    "What are you overthinking tonight?",
    "Whatever is keeping you awake — write it.",
    "Leave your worries here before you sleep.",
    "Tell the page what you can't tell anyone else.",
    "What would you say if no one could read it?",
  ],
} as const;

function NoteEditorRoute() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const note = useLumina((s) => s.notes.find((n) => n.id === id));
  const updateNote = useLumina((s) => s.updateNote);
  const deleteNote = useLumina((s) => s.deleteNote);
  const duplicateNote = useLumina((s) => s.duplicateNote);
  const saveNoteVersion = useLumina((s) => s.saveNoteVersion);

  const [focus, setFocus] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      const inField = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable;
      if (inField) return;
      e.preventDefault();
      navigate({ to: "/app/notes" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  if (!note) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-6 py-24 text-center">
        <div className="font-display text-2xl">This page is gone.</div>
        <p className="text-sm text-muted-foreground">The note you're looking for was removed, or never existed.</p>
        <Link
          to="/app/notes"
          className="inline-flex items-center gap-2 rounded-full bg-primary/90 px-4 py-2 text-sm text-primary-foreground shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to notes
        </Link>
      </div>
    );
  }

  return (
    <div
      className="relative z-0 flex min-h-[calc(100dvh-24px)] w-full flex-col"
      role="region"
      aria-label="Note writing space"
    >
      {/* Ambient Lumina wash — warm blush + gold in light, deep ink + ember in dark. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 55% at 18% 8%, color-mix(in oklab, oklch(0.86 0.12 340) 22%, transparent), transparent 65%)," +
            "radial-gradient(55% 55% at 85% 92%, color-mix(in oklab, oklch(0.82 0.14 55) 20%, transparent), transparent 70%)," +
            "radial-gradient(80% 60% at 50% 50%, color-mix(in oklab, oklch(0.65 0.08 320) 8%, transparent), transparent 75%)",
        }}
      />


      <NoteEditor
        note={note}
        update={updateNote}
        remove={(nid) => { deleteNote(nid); navigate({ to: "/app/notes" }); }}
        duplicate={(nid) => {
          duplicateNote(nid);
          const copy = useLumina.getState().notes[0];
          if (copy && copy.id !== nid) {
            navigate({ to: "/app/notes/$id", params: { id: copy.id } });
          }
        }}
        saveVersion={saveNoteVersion}
        openFocus={() => setFocus(true)}
        openReading={() => setReading(true)}
        onBack={() => navigate({ to: "/app/notes" })}
      />

      <FocusMode
        open={focus}
        onClose={() => setFocus(false)}
        content={note.content}
        onChange={(html) => updateNote(note.id, { content: html })}
        title={note.title}
      />
      <ReadingMode
        open={reading}
        onClose={() => setReading(false)}
        title={note.title}
        content={note.content}
        meta={`Note · updated ${new Date(note.updatedAt).toLocaleDateString()}`}
      />
    </div>
  );
}


/* ---------------- shared editor ---------------- */

function useAutoSave(noteId: string, hasContent: boolean, saveVersion: (id: string) => void) {
  const hasContentRef = useRef(hasContent);
  hasContentRef.current = hasContent;
  useEffect(() => {
    const t = setInterval(() => {
      if (hasContentRef.current) saveVersion(noteId);
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [noteId, saveVersion]);
}

type EditorProps = {
  note: Note;
  update: (id: string, patch: Partial<Note>) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  saveVersion: (id: string) => void;
  openFocus: () => void;
  openReading: () => void;
  onBack: () => void;
};

function NoteEditor({
  note, update, remove, duplicate, saveVersion, openFocus, openReading, onBack,
}: EditorProps) {
  const [status, setStatus] = useState<"saved" | "saving">("saved");
  const [showHistory, setShowHistory] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { words, chars, readMin } = useMemo(() => {
    const w = wordsFromHtml(note.content);
    const c = stripHtml(note.content).length;
    return { words: w, chars: c, readMin: Math.max(1, Math.ceil(w / 220)) };
  }, [note.content]);

  const onContent = (html: string) => {
    setStatus("saving");
    update(note.id, { content: html });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("saved"), 500);
  };

  useAutoSave(note.id, !!note.content, saveVersion);
  const trashed = !!note.trashed;

  // Time-of-day greeting + writing prompt. The bucket is derived from the
  // local hour; the specific prompt is chosen once per editing session so it
  // stays stable while the user writes but feels fresh each time they open
  // a note (or the hour ticks into a new period).
  const now = new Date();
  const h = now.getHours();
  const bucket: keyof typeof GREETINGS =
    h >= 5 && h < 12 ? "morning" :
    h >= 12 && h < 17 ? "afternoon" :
    h >= 17 && h < 21 ? "evening" :
    h >= 21 && h < 24 ? "night" : "midnight";
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  const { greeting, prompt } = useMemo(() => {
    const g = GREETINGS[bucket];
    const p = PROMPTS[bucket];
    return {
      greeting: g[Math.floor(Math.random() * g.length)],
      prompt: p[Math.floor(Math.random() * p.length)],
    };
    // Rebuild only when the note or time bucket changes — stable per session.
  }, [note.id, bucket]);
  const isBlank = stripHtml(note.content).trim().length === 0;


  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex min-h-full flex-1 flex-col"
    >
      {/* Floating glass command pill — hovers over the ambient wash, never
         welded to a hard bar. Visually it belongs to the paper below. */}
      <div className="sticky top-3 z-30 mx-auto w-full max-w-[960px] px-3 sm:px-6">
        <div
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-1.5",
            "border border-white/40 bg-white/55 backdrop-blur-xl lumina-elev-2",
            "dark:border-white/10 dark:bg-neutral-900/55",
          )}
        >
          <button
            onClick={onBack}
            aria-label="Back to notes"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted-foreground transition hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Library</span>
          </button>

          <motion.span
            key={String(status) + note.updatedAt}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="ml-1 hidden items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-muted-foreground sm:inline-flex"
          >
            <Heart className={cn("h-3 w-3 text-primary", status === "saved" && "fill-primary")} />
            {status === "saving" ? "Saving…" : "Saved"}
          </motion.span>

          <div className="ml-auto flex items-center gap-0.5">
            <IconBtn
              label={note.pinned ? "Unpin" : "Pin"}
              active={!!note.pinned}
              onClick={() => update(note.id, { pinned: !note.pinned })}
            >
              <Pin className={cn("h-4 w-4", note.pinned && "fill-primary")} />
            </IconBtn>
            <IconBtn
              label={note.favorite ? "Unfavorite" : "Favorite"}
              active={!!note.favorite}
              onClick={() => update(note.id, { favorite: !note.favorite })}
            >
              <Heart className={cn("h-4 w-4", note.favorite && "fill-[oklch(0.7_0.2_20)] text-[oklch(0.7_0.2_20)]")} />
            </IconBtn>
            <IconBtn label="Focus mode" onClick={openFocus}>
              <Maximize2 className="h-4 w-4" />
            </IconBtn>
            <IconBtn label="Reading mode" onClick={openReading}>
              <BookOpen className="h-4 w-4" />
            </IconBtn>
            <WritingAtmosphere />
            <IconBtn label="History" active={showHistory} onClick={() => setShowHistory((v) => !v)}>
              <History className="h-4 w-4" />
            </IconBtn>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="More"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/60 hover:text-foreground sm:h-9 sm:w-9 dark:hover:bg-white/10"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="w-52">
                <DropdownMenuItem onClick={() => update(note.id, { archived: !note.archived })}>
                  <Archive className="mr-2 h-4 w-4" /> {note.archived ? "Unarchive" : "Archive"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => duplicate(note.id)}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { saveVersion(note.id); toast.success("Snapshot saved"); }}>
                  <Expand className="mr-2 h-4 w-4" /> Save snapshot
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {trashed ? (
                  <>
                    <DropdownMenuItem onClick={() => update(note.id, { trashed: false })}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Restore
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => remove(note.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete forever
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onClick={() => update(note.id, { trashed: true })}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Move to trash
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* The Living Paper — stretches naturally as the page itself. Its sticky
         formatting toolbar sits just below the command pill and the letterhead
         renders inside the paper as the first block of the note. */}
      <div className="mx-auto mt-3 w-full max-w-[960px] flex-1 px-3 sm:px-6">
        <RichEditor
          content={note.content}
          onChange={onContent}
          autofocus
          seamless
          stickyOffset={64}
          header={
            <div className="text-center">
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.08 }}
                className="font-hand text-2xl text-primary/80 sm:text-3xl"
              >
                {greeting}
              </motion.div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                {dateLabel}
              </div>

              <input
                value={note.title}
                onChange={(e) => update(note.id, { title: e.target.value })}
                placeholder="Untitled"
                aria-label="Note title"
                className="mt-4 w-full border-none bg-transparent text-center font-display text-3xl leading-tight tracking-tight outline-none placeholder:text-muted-foreground sm:text-4xl"
              />

              <div className="mt-2 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                <span>{words} words</span>
                <span aria-hidden className="text-primary/50">·</span>
                <span>{chars} chars</span>
                <span aria-hidden className="text-primary/50">·</span>
                <span>{readMin} min</span>
              </div>

              <div className="mx-auto mt-4 flex items-center justify-center gap-3 opacity-70">
                <span className="h-px w-16 bg-gradient-to-r from-transparent via-primary/60 to-primary/60" />
                <span className="text-primary/70" aria-hidden>❦</span>
                <span className="h-px w-16 bg-gradient-to-l from-transparent via-primary/60 to-primary/60" />
              </div>

              <AnimatePresence>
                {isBlank && (
                  <motion.p
                    key="prompt"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, delay: 0.15 }}
                    className="mx-auto mt-3 max-w-md font-hand text-base text-muted-foreground sm:text-lg"
                  >
                    This page is yours. {prompt}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          }
        />

        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-8 overflow-hidden rounded-2xl border border-white/50 bg-white/40 p-4 backdrop-blur-md dark:border-white/10 dark:bg-white/5"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Version history</div>
                <button
                  onClick={() => { saveVersion(note.id); toast.success("Snapshot saved"); }}
                  className="rounded-full bg-white/70 px-3 py-1 text-[11px] uppercase tracking-widest dark:bg-white/10"
                >
                  Snapshot now
                </button>
              </div>
              {(note.versions?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No snapshots yet — one is taken every few minutes while writing.</p>
              ) : (
                <ul className="space-y-2">
                  {note.versions!.map((v) => (
                    <li key={v.at} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm dark:bg-white/10">
                      <span className="truncate text-muted-foreground">
                        {new Date(v.at).toLocaleString()} · {wordsFromHtml(v.content)} words
                      </span>
                      <button
                        onClick={() => { saveVersion(note.id); update(note.id, { content: v.content }); }}
                        className="rounded-full bg-primary/15 px-3 py-1 text-[11px] uppercase tracking-widest text-primary"
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}



function IconBtn({
  label, active, onClick, children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full transition sm:h-9 sm:w-9",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}
