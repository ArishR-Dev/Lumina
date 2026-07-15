import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import {
  Bold, Italic, Underline as UIcon, Highlighter, Quote, Heading1, Heading2,
  Link as LinkIcon, Image as ImageIcon, Mic, ListChecks, Minus, Calendar,
  Sparkles, BookHeart, Package, Feather, Clock, PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Callout } from "@/lib/lumina-editor";
import { LuminaLink } from "./extensions/lumina-link";
import { VoiceCard } from "./extensions/voice-card";
import { PrintedMemory } from "./extensions/printed-memory";
import { RecordDialog } from "./RecordDialog";
import { EntityPicker, type PickerKind } from "./EntityPicker";
import { EmptyState } from "./EmptyState";
import { FormattingToolbar } from "./FormattingToolbar";
import { resolveContextualPlaceholder } from "./placeholder-copy";
import { useLumina } from "@/lib/lumina-store";
import { stripHtml } from "@/lib/lumina-timeline";
import { initialDisplayName } from "@/lib/filename";

import "./paper.css";

/* --------------------------------------------------------------
   Public API — same props as the old RichEditor for drop-in swap.
   -------------------------------------------------------------- */
type Props = {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autofocus?: boolean;
  className?: string;
  /** Optional mood tag ("happy" | "sad" | "grateful" | "anxious" | …) — steers the contextual placeholder copy. */
  mood?: string;
  /** Optional header rendered inside the paper, between the sticky toolbar and the editor content. */
  header?: React.ReactNode;
  /** Sticky offset (px) for the toolbar dock, to sit below a fixed/sticky command pill above the paper. */
  stickyOffset?: number;
  /** When true, the paper stretches to the viewport with no bottom rounded corners (feels like the page itself). */
  seamless?: boolean;
};

/* --------------------------------------------------------------
   Slash commands
   -------------------------------------------------------------- */
type CmdGroup = "Create" | "Attach" | "Text" | "Date";
type Cmd = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  group: CmdGroup;
  keywords: string[];
  run: (ed: Editor, ctx: SlashCtx) => void;
};
type SlashCtx = {
  openVoice: () => void;
  openPicker: (k: PickerKind) => void;
  openImage: () => void;
};

const COMMANDS: Cmd[] = [
  { id: "voice", label: "Voice Memory", hint: "Record something aloud.", icon: <Mic className="h-4 w-4" />, group: "Create", keywords: ["voice", "record", "audio", "whisper"],
    run: (_e, ctx) => ctx.openVoice() },
  { id: "image", label: "Printed Memory", hint: "Attach a moment.", icon: <ImageIcon className="h-4 w-4" />, group: "Create", keywords: ["image", "photo", "picture", "memory", "printed"],
    run: (_e, ctx) => ctx.openImage() },
  { id: "memory", label: "Memory", hint: "Link a keepsake.", icon: <BookHeart className="h-4 w-4" />, group: "Attach", keywords: ["memory", "keepsake"],
    run: (_e, ctx) => ctx.openPicker("memory") },
  { id: "letter", label: "Letter", hint: "Write to someone.", icon: <Feather className="h-4 w-4" />, group: "Attach", keywords: ["letter", "write", "someone"],
    run: (e) => insertChip(e, { kind: "letter", refId: "", label: "A letter", emoji: "💌", href: "/app/letters" }) },
  { id: "farewell", label: "Farewell", hint: "Release something.", icon: <Feather className="h-4 w-4" />, group: "Attach", keywords: ["farewell", "release", "goodbye"],
    run: (e) => insertChip(e, { kind: "farewell", refId: "", label: "Farewell ritual", emoji: "🕊️", href: "/app/farewell" }) },
  { id: "journal", label: "Journal Entry", hint: "Link a day.", icon: <PenLine className="h-4 w-4" />, group: "Attach", keywords: ["journal", "diary", "day"],
    run: (_e, ctx) => ctx.openPicker("journal") },
  { id: "capsule", label: "Capsule", hint: "Send a message forward.", icon: <Package className="h-4 w-4" />, group: "Attach", keywords: ["capsule", "future", "time"],
    run: (_e, ctx) => ctx.openPicker("capsule") },
  { id: "note", label: "Note", hint: "Weave in another page.", icon: <Sparkles className="h-4 w-4" />, group: "Attach", keywords: ["note", "reference"],
    run: (_e, ctx) => ctx.openPicker("note") },
  { id: "h1", label: "Title", hint: "Big line, quiet weight.", icon: <Heading1 className="h-4 w-4" />, group: "Text", keywords: ["heading", "h1", "title"],
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: "h2", label: "Section", hint: "Break the page open.", icon: <Heading2 className="h-4 w-4" />, group: "Text", keywords: ["heading", "h2", "section"],
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "quote", label: "Quote", hint: "A line worth keeping.", icon: <Quote className="h-4 w-4" />, group: "Text", keywords: ["quote", "blockquote"],
    run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: "checklist", label: "Task", hint: "Something to do.", icon: <ListChecks className="h-4 w-4" />, group: "Text", keywords: ["checklist", "todo", "task"],
    run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: "divider", label: "Divider", hint: "A quiet pause.", icon: <Minus className="h-4 w-4" />, group: "Text", keywords: ["divider", "hr", "line"],
    run: (e) => e.chain().focus().setHorizontalRule().run() },
  { id: "date", label: "Today's date", hint: "Mark this moment.", icon: <Calendar className="h-4 w-4" />, group: "Date", keywords: ["date", "today"],
    run: (e) => e.chain().focus().insertContent(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })).run() },
  { id: "time", label: "Current time", hint: "Right now.", icon: <Clock className="h-4 w-4" />, group: "Date", keywords: ["time", "now"],
    run: (e) => e.chain().focus().insertContent(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })).run() },
];

const SLASH_GROUP_ORDER: CmdGroup[] = ["Create", "Attach", "Text", "Date"];

/* Fuzzy weighted score — higher is better. Returns -1 when no match. */
function fuzzyScore(query: string, label: string, keywords: string[]): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const l = label.toLowerCase();
  if (l === q) return 1000;
  if (l.startsWith(q)) return 800 - (l.length - q.length);
  if (l.includes(q)) return 600 - l.indexOf(q);
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (k.startsWith(q)) return 500;
    if (k.includes(q)) return 400;
  }
  // subsequence match on label
  let i = 0;
  for (const ch of l) {
    if (ch === q[i]) i++;
    if (i === q.length) return 300 - (l.length - q.length);
  }
  return -1;
}

/* @-mention kinds — opens the appropriate picker/chip */
type MentionKind = {
  id: string;
  label: string;
  hint: string;
  emoji: string;
  run: (ctx: SlashCtx, insert: (attrs: { kind: string; refId: string; label: string; emoji: string; href: string }) => void) => void;
};
const MENTIONS: MentionKind[] = [
  { id: "memory",   label: "Memory",         hint: "A keepsake.",           emoji: "🌸", run: (c) => c.openPicker("memory") },
  { id: "journal",  label: "Journal Entry",  hint: "A day.",                emoji: "📖", run: (c) => c.openPicker("journal") },
  { id: "capsule",  label: "Capsule",        hint: "Sealed for later.",     emoji: "📦", run: (c) => c.openPicker("capsule") },
  { id: "note",     label: "Note",           hint: "Another page.",         emoji: "📝", run: (c) => c.openPicker("note") },
  { id: "farewell", label: "Farewell",       hint: "Something released.",   emoji: "🕊️", run: (_c, i) => i({ kind: "farewell", refId: "", label: "Farewell ritual", emoji: "🕊️", href: "/app/farewell" }) },
  { id: "letter",   label: "Letter",         hint: "A message.",            emoji: "💌", run: (_c, i) => i({ kind: "letter",   refId: "", label: "A letter",        emoji: "💌", href: "/app/letters" }) },
  { id: "thought",  label: "Thought",        hint: "A fleeting note.",      emoji: "💭", run: (_c, i) => i({ kind: "thought",  refId: "", label: "A thought",       emoji: "💭", href: "/app/notes" }) },
  { id: "task",     label: "Task",           hint: "Something to do.",      emoji: "✅", run: (_c, i) => i({ kind: "task",     refId: "", label: "Task",            emoji: "✅", href: "/app/tasks" }) },
];

function insertChip(editor: Editor, attrs: { kind: string; refId: string; label: string; emoji: string; href: string }) {
  editor.chain().focus().insertContent({ type: "luminaLink", attrs }).run();
}

/* --------------------------------------------------------------
   LuminaEditor
   -------------------------------------------------------------- */
export function LuminaEditor({ content, onChange, placeholder, autofocus, className, mood, header, stickyOffset, seamless }: Props) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPos, setLinkPos] = useState<{ top: number; left: number } | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<PickerKind | null>(null);
  const [writing, setWriting] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [styleOpen, setStyleOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [kbInset, setKbInset] = useState(0);

  const paperRef = useRef<HTMLDivElement | null>(null);
  const writingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Real Lumina entities for @-mention inline previews.
  const memories = useLumina((s) => s.memories);
  const journal = useLumina((s) => s.journal);
  const notes = useLumina((s) => s.notes);
  const capsules = useLumina((s) => s.capsules);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: ({ node, editor: ed }) => {
          // Only decorate the very first paragraph, and only when the whole
          // doc is empty — the EmptyState overlay owns the wider hello.
          if (placeholder) return placeholder;
          const isFirst = ed.state.doc.firstChild === node;
          if (!isFirst) return "";
          if (ed.state.doc.textContent.length > 0) return "";
          return resolveContextualPlaceholder(mood);
        },
      }),
      Typography,
      Underline,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ HTMLAttributes: { loading: "lazy" } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Callout,
      LuminaLink,
      VoiceCard,
      PrintedMemory,
    ],
    content: content || "",
    autofocus: autofocus ?? false,
    editorProps: {
      attributes: {
        class: "lumina-prose",
        spellcheck: "true",
      },
      handleKeyDown(view, event) {
        if (event.key === "/") {
          const { $from } = view.state.selection;
          const before = $from.parent.textContent.slice(0, $from.parentOffset);
          if (before.trim() === "") {
            setTimeout(() => openSlashAtCursor(), 0);
          }
        }
        if (event.key === "@") {
          const { $from } = view.state.selection;
          const before = $from.parent.textContent.slice(0, $from.parentOffset);
          const prev = before.slice(-1);
          if (prev === "" || /\s/.test(prev)) {
            setTimeout(() => openMentionAtCursor(), 0);
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      setCharCount(editor.state.doc.textContent.length);
      markWriting();
      if (slashOpen) {
        const q = readTriggerQuery(editor, "/");
        if (q === null) closeSlash();
        else setSlashQuery(q);
      }
      if (mentionOpen) {
        const q = readTriggerQuery(editor, "@");
        if (q === null) closeMention();
        else setMentionQuery(q);
      }
    },
    onSelectionUpdate: () => {
      if (slashOpen) {
        const q = editor && readTriggerQuery(editor, "/");
        if (q === null) closeSlash();
      }
      if (mentionOpen) {
        const q = editor && readTriggerQuery(editor, "@");
        if (q === null) closeMention();
      }
    },
    onFocus: () => setFocused(true),
    onBlur: () => {
      // Delay so palette button clicks (mousedown) still land before the
      // mobile dock disappears.
      setTimeout(() => setFocused(false), 120);
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor) setCharCount(editor.state.doc.textContent.length);
  }, [editor]);

  // Track soft-keyboard inset via visualViewport so the mobile palette
  // can dock just above the keyboard. Silently no-op on desktop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const bottomGap = window.innerHeight - (vv.height + vv.offsetTop);
      setKbInset(Math.max(0, Math.round(bottomGap)));
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  const markWriting = useCallback(() => {
    setWriting(true);
    if (writingTimer.current) clearTimeout(writingTimer.current);
    writingTimer.current = setTimeout(() => setWriting(false), 1400);
  }, []);

  const readTriggerQuery = (ed: Editor, trigger: "/" | "@"): string | null => {
    const { $from } = ed.state.selection;
    const text = $from.parent.textContent.slice(0, $from.parentOffset);
    const re = trigger === "/"
      ? /(^|\s)\/([^\s/]*)$/
      : /(^|\s)@([^\s@]*)$/;
    const m = re.exec(text);
    return m ? m[2] : null;
  };

  const openSlashAtCursor = () => {
    if (!editor) return;
    try {
      const { from } = editor.state.selection;
      const coords = editor.view.coordsAtPos(from);
      const paper = paperRef.current?.getBoundingClientRect();
      if (!paper) return;
      setSlashPos({
        top: coords.bottom - paper.top + 6,
        left: coords.left - paper.left,
      });
      setSlashQuery("");
      setSlashIndex(0);
      setSlashOpen(true);
    } catch { /* noop */ }
  };

  const closeSlash = () => { setSlashOpen(false); setSlashQuery(""); };

  const openMentionAtCursor = () => {
    if (!editor) return;
    try {
      const { from } = editor.state.selection;
      const coords = editor.view.coordsAtPos(from);
      const paper = paperRef.current?.getBoundingClientRect();
      if (!paper) return;
      setMentionPos({
        top: coords.bottom - paper.top + 6,
        left: coords.left - paper.left,
      });
      setMentionQuery("");
      setMentionIndex(0);
      setMentionOpen(true);
    } catch { /* noop */ }
  };

  const closeMention = () => { setMentionOpen(false); setMentionQuery(""); };

  const filteredCommands = useMemo(() => {
    const q = slashQuery.trim();
    if (!q) return COMMANDS;
    const scored = COMMANDS
      .map((c) => ({ c, s: fuzzyScore(q, c.label, c.keywords) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s);
    return scored.map((x) => x.c);
  }, [slashQuery]);

  const ctx: SlashCtx = {
    openVoice: () => setRecordOpen(true),
    openPicker: (k) => setPickerKind(k),
    openImage: () => fileInputRef.current?.click(),
  };

  const runCommand = (cmd: Cmd) => {
    if (!editor) return;
    // strip the "/query" text before running
    const { $from } = editor.state.selection;
    const text = $from.parent.textContent.slice(0, $from.parentOffset);
    const m = /\/([^\s/]*)$/.exec(text);
    if (m) {
      const del = m[0].length;
      editor.chain().focus().deleteRange({ from: $from.pos - del, to: $from.pos }).run();
    }
    closeSlash();
    cmd.run(editor, ctx);
  };

  const filteredMentions = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return MENTIONS;
    return MENTIONS.filter((m) => m.label.toLowerCase().includes(q) || m.id.includes(q));
  }, [mentionQuery]);

  const runMention = (m: MentionKind) => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    const text = $from.parent.textContent.slice(0, $from.parentOffset);
    const match = /@([^\s@]*)$/.exec(text);
    if (match) {
      const del = match[0].length;
      editor.chain().focus().deleteRange({ from: $from.pos - del, to: $from.pos }).run();
    }
    closeMention();
    m.run(ctx, (attrs) => insertChip(editor, attrs));
  };

  /** Preview items for the @-mention menu, per kind. */
  type MentionPreview = { refId: string; label: string; emoji: string; href: string };
  const mentionPreviews = useMemo((): Record<string, MentionPreview[]> => {
    const memoryItems: MentionPreview[] = memories.slice(0, 3).map((m) => ({
      refId: m.id,
      label: m.caption || m.album || "Memory",
      emoji: "🌸",
      href: `/app/memories/${m.id}`,
    }));
    const journalItems: MentionPreview[] = [...journal]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 3)
      .map((j) => ({
        refId: j.date,
        label: new Date(j.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        emoji: "📖",
        href: `/app/journal?date=${j.date}`,
      }));
    const noteItems: MentionPreview[] = [...notes]
      .filter((n) => !n.trashed)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3)
      .map((n) => ({
        refId: n.id,
        label: n.title || stripHtml(n.content).slice(0, 24) || "Untitled",
        emoji: "📝",
        href: `/app/notes/${n.id}`,
      }));
    const capsuleItems: MentionPreview[] = capsules.slice(0, 3).map((c) => ({
      refId: c.id,
      label: c.title || "A capsule",
      emoji: "📦",
      href: `/app/capsules/${c.id}`,
    }));
    return { memory: memoryItems, journal: journalItems, note: noteItems, capsule: capsuleItems };
  }, [memories, journal, notes, capsules]);

  const runMentionPreview = (kind: string, p: MentionPreview) => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    const text = $from.parent.textContent.slice(0, $from.parentOffset);
    const match = /@([^\s@]*)$/.exec(text);
    if (match) {
      const del = match[0].length;
      editor.chain().focus().deleteRange({ from: $from.pos - del, to: $from.pos }).run();
    }
    closeMention();
    insertChip(editor, { kind, refId: p.refId, label: p.label, emoji: p.emoji, href: p.href });
  };

  // Slash keyboard nav
  useEffect(() => {
    if (!slashOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeSlash(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % Math.max(1, filteredCommands.length)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + Math.max(1, filteredCommands.length)) % Math.max(1, filteredCommands.length)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filteredCommands[slashIndex] || filteredCommands[0];
        if (cmd) runCommand(cmd);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [slashOpen, filteredCommands, slashIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mention keyboard nav
  useEffect(() => {
    if (!mentionOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeMention(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % Math.max(1, filteredMentions.length)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + Math.max(1, filteredMentions.length)) % Math.max(1, filteredMentions.length)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const m = filteredMentions[mentionIndex] || filteredMentions[0];
        if (m) runMention(m);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mentionOpen, filteredMentions, mentionIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reactive paper — subtle light + shadow drift follow the cursor.
  // Pauses when the tab is hidden to save battery.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = paperRef.current;
    if (!el) return;
    if (el.closest('[data-reduced-fx="true"]')) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let px = 50, py = -20;
    let paused = document.hidden;
    const apply = () => {
      raf = 0;
      el.style.setProperty("--paper-light-x", `${px}%`);
      el.style.setProperty("--paper-light-y", `${py}%`);
      // Shadow-angle drift: ±0.4deg mapped from cursor x/y.
      const ax = ((px - 50) / 60) * 0.4;
      const ay = ((py - 50) / 60) * 0.4;
      el.style.setProperty("--paper-shadow-x", ax.toFixed(3));
      el.style.setProperty("--paper-shadow-y", ay.toFixed(3));
    };
    const onMove = (e: MouseEvent) => {
      if (paused) return;
      const r = el.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 100;
      const ny = ((e.clientY - r.top) / r.height) * 100;
      px = Math.max(-10, Math.min(110, nx));
      py = Math.max(-30, Math.min(120, ny));
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      px = 50; py = -20;
      apply();
    };
    const onVisibility = () => {
      paused = document.hidden;
      if (paused && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    el.addEventListener("mousemove", onMove, { passive: true });
    el.addEventListener("mouseleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Cmd/Ctrl+K → link popover.  Cmd/Ctrl+Shift+K → remove link.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "k") return;
      if (!editor) return;
      if (e.shiftKey) {
        if (editor.isActive("link")) {
          e.preventDefault();
          editor.chain().focus().extendMarkRange("link").unsetLink().run();
        }
        return;
      }
      const { from, to } = editor.state.selection;
      if (from === to) return;
      e.preventDefault();
      const prev = editor.getAttributes("link").href as string | undefined;
      setLinkUrl(prev || "");
      try {
        const coords = editor.view.coordsAtPos(from);
        const paper = paperRef.current?.getBoundingClientRect();
        if (paper) setLinkPos({ top: coords.top - paper.top - 48, left: coords.left - paper.left });
      } catch { /* noop */ }
      setLinkOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

  // Insert a Printed Memory node (new node — legacy <img> nodes still render via Image extension).
  const insertPrintedMemory = (src: string, caption = "") => {
    if (!editor || !src) return;
    editor.chain().focus().insertContent({
      type: "printedMemory",
      attrs: { src, caption, capturedAt: Date.now(), width: 0 },
    }).run();
  };

  // Image file input — preserves the user's original filename as the caption.
  const onImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !editor) return;
    const reader = new FileReader();
    reader.onload = () => insertPrintedMemory(String(reader.result || ""), initialDisplayName(f.name, f.type));
    reader.readAsDataURL(f);
  };

  // Drag & drop images — also preserves the original filename.
  useEffect(() => {
    const el = paperRef.current;
    if (!el || !editor) return;
    const onDrop = (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const file = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => insertPrintedMemory(String(reader.result || ""), initialDisplayName(file.name, file.type));
      reader.readAsDataURL(file);
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    el.addEventListener("drop", onDrop);
    el.addEventListener("dragover", onDragOver);
    return () => {
      el.removeEventListener("drop", onDrop);
      el.removeEventListener("dragover", onDragOver);
    };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps


  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^https?:\/\//i.test(url) || url.startsWith("/") ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  };
  const removeLink = () => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  };

  const openLinkPopover = () => {
    if (!editor) return;
    const { from } = editor.state.selection;
    try {
      const coords = editor.view.coordsAtPos(from);
      const paper = paperRef.current?.getBoundingClientRect();
      if (paper) setLinkPos({ top: coords.top - paper.top - 48, left: coords.left - paper.left });
    } catch { /* noop */ }
    setLinkUrl((editor.getAttributes("link").href as string) || "");
    setLinkOpen(true);
  };

  const HIGHLIGHTS = [
    { name: "Peach",  color: "oklch(0.92 0.10 65)"  },
    { name: "Sage",   color: "oklch(0.90 0.08 150)" },
    { name: "Lilac",  color: "oklch(0.90 0.08 300)" },
  ];

  const renderPalette = ({ variant }: { variant: "desktop" | "mobile" }) => {
    if (!editor) return null;
    return (
      <>
        {/* Style pill dropdown */}
        <div className="writers-palette-group">
          <button
            type="button"
            className="writers-palette-pill"
            aria-label="Text style"
            data-open={styleOpen ? "true" : "false"}
            onMouseDown={(e) => { e.preventDefault(); setStyleOpen((v) => !v); setHighlightOpen(false); }}
          >
            {editor.isActive("heading", { level: 1 }) ? "Title"
              : editor.isActive("heading", { level: 2 }) ? "Section"
              : editor.isActive("heading", { level: 3 }) ? "Subsection"
              : editor.isActive("blockquote") ? "Quote"
              : editor.isActive("codeBlock") ? "Code"
              : "Body"}
            <span aria-hidden>▾</span>
          </button>
          {styleOpen && (
            <div className="writers-palette-menu">
              {[
                { label: "Title",      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
                { label: "Section",    run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
                { label: "Subsection", run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
                { label: "Body",       run: () => editor.chain().focus().setParagraph().run() },
                { label: "Quote",      run: () => editor.chain().focus().toggleBlockquote().run() },
                { label: "Code",       run: () => editor.chain().focus().toggleCodeBlock().run() },
              ].map((it) => (
                <button
                  key={it.label}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); it.run(); setStyleOpen(false); }}
                >{it.label}</button>
              ))}
            </div>
          )}
        </div>

        <span className="lumina-bubble-sep" />

        <BtnB ed={editor} action={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} label="Bold"><Bold className="h-4 w-4" /></BtnB>
        <BtnB ed={editor} action={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} label="Italic"><Italic className="h-4 w-4" /></BtnB>
        <BtnB ed={editor} action={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} label="Underline"><UIcon className="h-4 w-4" /></BtnB>

        {/* Highlight — swatch submenu */}
        <div className="writers-palette-group">
          <button
            type="button"
            aria-label="Highlight"
            data-active={editor.isActive("highlight") ? "true" : "false"}
            onMouseDown={(e) => { e.preventDefault(); setHighlightOpen((v) => !v); setStyleOpen(false); }}
          >
            <Highlighter className="h-4 w-4" />
          </button>
          {highlightOpen && (
            <div className="writers-palette-swatches">
              {HIGHLIGHTS.map((h) => (
                <button
                  key={h.name}
                  type="button"
                  aria-label={`Highlight ${h.name}`}
                  className="writers-palette-swatch"
                  style={{ background: h.color }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor.chain().focus().setHighlight({ color: h.color }).run();
                    setHighlightOpen(false);
                  }}
                />
              ))}
              <button
                type="button"
                aria-label="Clear highlight"
                className="writers-palette-swatch writers-palette-swatch-clear"
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().unsetHighlight().run();
                  setHighlightOpen(false);
                }}
              >×</button>
            </div>
          )}
        </div>

        <span className="lumina-bubble-sep" />

        <BtnB ed={editor} action={openLinkPopover} active={editor.isActive("link")} label="Link"><LinkIcon className="h-4 w-4" /></BtnB>
        <BtnB ed={editor} action={() => setRecordOpen(true)} active={false} label="Voice memory"><Mic className="h-4 w-4" /></BtnB>
        <BtnB ed={editor} action={() => fileInputRef.current?.click()} active={false} label="Image"><ImageIcon className="h-4 w-4" /></BtnB>
        {variant === "mobile" && (
          <BtnB ed={editor} action={() => openSlashAtCursor()} active={false} label="Insert"><Sparkles className="h-4 w-4" /></BtnB>
        )}
      </>
    );
  };

  if (!editor) return <div className={cn("lumina-paper min-h-[50vh]", className)} />;

  return (
    <div
      ref={paperRef}
      className={cn(
        "lumina-paper living-paper",
        seamless && "lumina-paper--seamless",
        className,
      )}
      data-lumina="living-paper"
      data-writing={writing ? "true" : "false"}
      onMouseMove={() => setWriting(false)}
    >
      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        shouldShow={({ editor: ed, from, to }: { editor: Editor; from: number; to: number }) => {
          if (from === to) return false;
          if (ed.isActive("voiceCard")) return false;
          return true;
        }}
      >
        <div className="lumina-bubble writers-palette">{renderPalette({ variant: "desktop" })}</div>
      </BubbleMenu>

      {/* Persistent formatting toolbar — desktop: pinned above writing area. */}
      <div
        className="lumina-toolbar-dock"
        style={stickyOffset != null ? { top: stickyOffset } : undefined}
      >
        <FormattingToolbar
          editor={editor}
          variant="desktop"
          onOpenLink={openLinkPopover}
          onOpenVoice={() => setRecordOpen(true)}
          onOpenImage={() => fileInputRef.current?.click()}
        />
      </div>

      {/* Mobile: dock the persistent toolbar above the keyboard when focused. */}
      {focused && (
        <div
          className="lumina-toolbar-mobile-dock"
          style={{ bottom: kbInset }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <FormattingToolbar
            editor={editor}
            variant="mobile"
            onOpenLink={openLinkPopover}
            onOpenVoice={() => setRecordOpen(true)}
            onOpenImage={() => fileInputRef.current?.click()}
          />
        </div>
      )}

      {header && <div className="lumina-paper-header">{header}</div>}

      {!header && <EmptyState charCount={charCount} />}
      <EditorContent editor={editor} />



      {slashOpen && slashPos && (
        <div className="lumina-slash absolute" style={{ top: slashPos.top, left: slashPos.left }} role="listbox" aria-label="Lumina inserts">
          {SLASH_GROUP_ORDER.map((group) => {
            const cmds = filteredCommands.filter((c) => c.group === group);
            if (cmds.length === 0) return null;
            return (
              <div key={group}>
                <div className="lumina-slash-group">{group}</div>
                {cmds.map((c) => {
                  const idx = filteredCommands.indexOf(c);
                  return (
                    <button
                      key={c.id}
                      role="option"
                      aria-selected={idx === slashIndex}
                      data-active={idx === slashIndex ? "true" : "false"}
                      onMouseEnter={() => setSlashIndex(idx)}
                      onMouseDown={(e) => { e.preventDefault(); runCommand(c); }}
                    >
                      <span className="lumina-slash-icon">{c.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="lumina-slash-label">{c.label}</span>
                        {c.hint && <span className="lumina-slash-hint block">{c.hint}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {filteredCommands.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">Nothing matches "{slashQuery}"</div>
          )}
        </div>
      )}

      {mentionOpen && mentionPos && (
        <div className="lumina-slash lumina-mentions absolute" style={{ top: mentionPos.top, left: mentionPos.left }} role="listbox" aria-label="Weave a Lumina entity">
          <div className="lumina-slash-group">Your Lumina</div>
          {filteredMentions.map((m, idx) => {
            const previews = mentionPreviews[m.id] || [];
            return (
              <div key={m.id} className="lumina-mention-row">
                <button
                  role="option"
                  aria-selected={idx === mentionIndex}
                  data-active={idx === mentionIndex ? "true" : "false"}
                  onMouseEnter={() => setMentionIndex(idx)}
                  onMouseDown={(e) => { e.preventDefault(); runMention(m); }}
                >
                  <span className="lumina-slash-icon">{m.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="lumina-slash-label">{m.label}</span>
                    <span className="lumina-slash-hint block">{m.hint}</span>
                  </span>
                </button>
                {previews.length > 0 && (
                  <div className="lumina-mention-previews" role="group" aria-label={`Recent ${m.label.toLowerCase()}s`}>
                    {previews.map((p) => (
                      <button
                        key={p.refId}
                        type="button"
                        className="lumina-mention-chip"
                        title={p.label}
                        onMouseDown={(e) => { e.preventDefault(); runMentionPreview(m.id, p); }}
                      >
                        <span aria-hidden>{p.emoji}</span>
                        <span className="truncate">{p.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filteredMentions.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">Nothing matches "{mentionQuery}"</div>
          )}
        </div>
      )}

      {linkOpen && linkPos && (() => {
        const trimmed = linkUrl.trim();
        const hrefForPreview = trimmed
          ? (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/") ? trimmed : `https://${trimmed}`)
          : "";
        let host = "";
        try { if (hrefForPreview && !hrefForPreview.startsWith("/")) host = new URL(hrefForPreview).host; } catch { /* noop */ }
        const favicon = host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : "";
        return (
          <div className="lumina-linkpop absolute" style={{ top: linkPos.top, left: linkPos.left }}>
            {host ? (
              <span className="lumina-link-host" aria-hidden="true">
                <img src={favicon} alt="" width={16} height={16} loading="lazy" />
                <span className="truncate">{host}</span>
              </span>
            ) : null}
            <input
              autoFocus
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); applyLink(); }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setLinkOpen(false);
                  // Return focus to editor without collapsing the selection.
                  setTimeout(() => editor?.view.focus(), 0);
                }
              }}
            />
            {editor.isActive("link") && (
              <button className="secondary" onMouseDown={(e) => { e.preventDefault(); removeLink(); }} title="Remove link (⌘⇧K)">Remove</button>
            )}
            <button onMouseDown={(e) => { e.preventDefault(); applyLink(); }}>Apply</button>
          </div>
        );
      })()}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onImageFile} />

      {recordOpen && (
        <RecordDialog
          onClose={() => setRecordOpen(false)}
          onSave={(voiceId, duration) => {
            editor.chain().focus().insertContent({
              type: "voiceCard",
              attrs: { voiceId, duration, title: "" },
            }).run();
            setRecordOpen(false);
          }}
        />
      )}

      {pickerKind && (
        <EntityPicker
          kind={pickerKind}
          onClose={() => setPickerKind(null)}
          onPick={(attrs) => {
            insertChip(editor, attrs);
            setPickerKind(null);
          }}
        />
      )}
    </div>
  );
}

function BtnB({
  ed: _ed, action, active, label, children,
}: {
  ed: Editor;
  action: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-active={active ? "true" : "false"}
      onMouseDown={(e) => { e.preventDefault(); action(); }}
    >
      {children}
    </button>
  );
}
