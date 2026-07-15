import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Underline as UIcon, Highlighter, Quote, List, ListOrdered,
  ListChecks, Link as LinkIcon, Mic, Image as ImageIcon, Minus, Undo2, Redo2,
  MoreHorizontal, Strikethrough, Code, Eraser,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  editor: Editor;
  variant: "desktop" | "mobile";
  onOpenLink: () => void;
  onOpenVoice: () => void;
  onOpenImage: () => void;
};

const HIGHLIGHTS = [
  { name: "Peach", color: "oklch(0.92 0.10 65)" },
  { name: "Sage",  color: "oklch(0.90 0.08 150)" },
  { name: "Lilac", color: "oklch(0.90 0.08 300)" },
];

const STYLES: { label: string; match: (e: Editor) => boolean; run: (e: Editor) => void }[] = [
  { label: "Title",      match: (e) => e.isActive("heading", { level: 1 }), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "Heading",    match: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Subheading", match: (e) => e.isActive("heading", { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: "Body",       match: (e) => e.isActive("paragraph") && !e.isActive("heading"), run: (e) => e.chain().focus().setParagraph().run() },
];

export function FormattingToolbar({ editor, variant, onOpenLink, onOpenVoice, onOpenImage }: Props) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [hlOpen, setHlOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Force a re-render whenever the editor's selection, content, or history
  // stack changes. Coalesce many rapid events (typing fires selectionUpdate +
  // transaction + update in the same tick) into a single render per animation
  // frame — instant visually, zero lag while typing.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    let raf = 0;
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      raf = 0;
      forceTick((n) => (n + 1) % 1_000_000);
    };
    const rerender = () => {
      if (scheduled) return;
      scheduled = true;
      raf = requestAnimationFrame(flush);
    };
    // selectionUpdate covers cursor movement; update covers content/history
    // changes. transaction/focus/blur are redundant supersets of these.
    editor.on("selectionUpdate", rerender);
    editor.on("update", rerender);
    return () => {
      editor.off("selectionUpdate", rerender);
      editor.off("update", rerender);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [editor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setStyleOpen(false); setHlOpen(false); setMoreOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const closeMenus = () => { setStyleOpen(false); setHlOpen(false); setMoreOpen(false); };

  const currentStyle =
    STYLES.find((s) => s.label !== "Body" && s.match(editor))?.label ??
    (editor.isActive("blockquote") ? "Quote" : "Body");

  const canUndo = editor.can().chain().focus().undo().run();
  const canRedo = editor.can().chain().focus().redo().run();

  return (
    <div
      ref={rootRef}
      className={cn("lumina-toolbar", variant === "mobile" && "lumina-toolbar-mobile")}
      role="toolbar"
      aria-label="Formatting toolbar"
      onMouseDown={(e) => {
        // Prevent editor blur so selection remains
        if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault();
      }}
    >
      {/* Undo / Redo */}
      <TbBtn label="Undo" disabled={!canUndo} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </TbBtn>
      <TbBtn label="Redo" disabled={!canRedo} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </TbBtn>

      <span className="lumina-toolbar-sep" />

      {/* Text style */}
      <div className="lumina-toolbar-group">
        <button
          type="button"
          className="lumina-toolbar-pill"
          aria-haspopup="menu"
          aria-expanded={styleOpen}
          data-open={styleOpen ? "true" : "false"}
          onClick={() => { const v = !styleOpen; closeMenus(); setStyleOpen(v); }}
        >
          {currentStyle}
          <span aria-hidden>▾</span>
        </button>
        {styleOpen && (
          <div className="lumina-toolbar-menu" role="menu">
            {STYLES.map((s) => (
              <button
                key={s.label}
                type="button"
                role="menuitem"
                data-active={s.match(editor) ? "true" : "false"}
                onClick={() => { s.run(editor); setStyleOpen(false); }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="lumina-toolbar-sep" />

      {/* Inline marks */}
      <TbBtn label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </TbBtn>
      <TbBtn label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </TbBtn>
      <TbBtn label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UIcon className="h-4 w-4" />
      </TbBtn>

      {/* Highlight */}
      <div className="lumina-toolbar-group">
        <button
          type="button"
          aria-label="Highlight"
          aria-haspopup="menu"
          aria-expanded={hlOpen}
          data-active={editor.isActive("highlight") ? "true" : "false"}
          onClick={() => { const v = !hlOpen; closeMenus(); setHlOpen(v); }}
          className="lumina-toolbar-btn"
        >
          <Highlighter className="h-4 w-4" />
        </button>
        {hlOpen && (
          <div className="lumina-toolbar-menu lumina-toolbar-swatches" role="menu">
            {HIGHLIGHTS.map((h) => (
              <button
                key={h.name}
                type="button"
                aria-label={`Highlight ${h.name}`}
                className="lumina-toolbar-swatch"
                style={{ background: h.color }}
                onClick={() => { editor.chain().focus().setHighlight({ color: h.color }).run(); setHlOpen(false); }}
              />
            ))}
            <button
              type="button"
              aria-label="Clear highlight"
              className="lumina-toolbar-swatch lumina-toolbar-swatch-clear"
              onClick={() => { editor.chain().focus().unsetHighlight().run(); setHlOpen(false); }}
            >×</button>
          </div>
        )}
      </div>

      <span className="lumina-toolbar-sep" />

      {/* Lists */}
      <TbBtn label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </TbBtn>
      <TbBtn label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </TbBtn>
      <TbBtn label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks className="h-4 w-4" />
      </TbBtn>

      <span className="lumina-toolbar-sep" />

      {/* Quote & Divider */}
      <TbBtn label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </TbBtn>
      <TbBtn label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </TbBtn>

      <span className="lumina-toolbar-sep" />

      {/* Inserts */}
      <TbBtn label="Voice memory" onClick={onOpenVoice}>
        <Mic className="h-4 w-4" />
      </TbBtn>
      <TbBtn label="Printed memory" onClick={onOpenImage}>
        <ImageIcon className="h-4 w-4" />
      </TbBtn>
      <TbBtn label="Link" active={editor.isActive("link")} onClick={onOpenLink}>
        <LinkIcon className="h-4 w-4" />
      </TbBtn>

      <span className="lumina-toolbar-sep" />

      {/* More */}
      <div className="lumina-toolbar-group">
        <button
          type="button"
          aria-label="More formatting"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          className="lumina-toolbar-btn"
          data-open={moreOpen ? "true" : "false"}
          onClick={() => { const v = !moreOpen; closeMenus(); setMoreOpen(v); }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {moreOpen && (
          <div className="lumina-toolbar-menu lumina-toolbar-menu-right" role="menu">
            <button type="button" role="menuitem" data-active={editor.isActive("strike") ? "true" : "false"}
              onClick={() => { editor.chain().focus().toggleStrike().run(); setMoreOpen(false); }}>
              <Strikethrough className="h-4 w-4" /> Strikethrough
            </button>
            <button type="button" role="menuitem" data-active={editor.isActive("code") ? "true" : "false"}
              onClick={() => { editor.chain().focus().toggleCode().run(); setMoreOpen(false); }}>
              <Code className="h-4 w-4" /> Inline code
            </button>
            <button type="button" role="menuitem" data-active={editor.isActive("codeBlock") ? "true" : "false"}
              onClick={() => { editor.chain().focus().toggleCodeBlock().run(); setMoreOpen(false); }}>
              <Code className="h-4 w-4" /> Code block
            </button>
            <button type="button" role="menuitem"
              onClick={() => { editor.chain().focus().unsetAllMarks().clearNodes().run(); setMoreOpen(false); }}>
              <Eraser className="h-4 w-4" /> Clear formatting
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TbBtn({
  label, active, disabled, onClick, children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="lumina-toolbar-btn"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-active={active ? "true" : "false"}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
