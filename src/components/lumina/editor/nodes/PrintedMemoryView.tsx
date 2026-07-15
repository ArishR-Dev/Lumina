import { useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Trash2 } from "lucide-react";

/**
 * Printed Memory — a framed image with an optional caption and a
 * meta row (date). Resizable by the bottom-right corner handle.
 */
export function PrintedMemoryView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const src = String(node.attrs.src || "");
  const caption = String(node.attrs.caption || "");
  const capturedAt = Number(node.attrs.capturedAt) || 0;
  const width = Number(node.attrs.width) || 0;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; w: number } | null>(null);

  const isEditable = editor?.isEditable ?? true;

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!startRef.current || !wrapRef.current) return;
      const parent = wrapRef.current.parentElement?.getBoundingClientRect();
      const maxW = parent?.width || 800;
      const next = Math.max(180, Math.min(maxW, startRef.current.w + (e.clientX - startRef.current.x)));
      updateAttributes({ width: Math.round(next) });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, updateAttributes]);

  const beginResize = (e: React.MouseEvent) => {
    if (!wrapRef.current) return;
    e.preventDefault();
    startRef.current = { x: e.clientX, w: wrapRef.current.getBoundingClientRect().width };
    setDragging(true);
  };

  const dateLabel = capturedAt
    ? new Date(capturedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <NodeViewWrapper as="figure" className="lumina-printed" contentEditable={false} data-lumina-printed="true">
      <div
        ref={wrapRef}
        className="lumina-printed-frame"
        style={width ? { width } : undefined}
      >
        {src ? <img src={src} alt={caption || "Printed memory"} loading="lazy" draggable={false} /> : null}
        {isEditable && (
          <button
            type="button"
            className="lumina-printed-delete"
            aria-label="Remove memory"
            onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {isEditable && (
          <span
            role="separator"
            aria-orientation="vertical"
            className="lumina-printed-resize"
            onMouseDown={beginResize}
            aria-label="Resize memory"
          />
        )}
      </div>
      {isEditable ? (
        <input
          className="lumina-printed-caption"
          placeholder="Add a caption…"
          value={caption}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
        />
      ) : (
        caption ? <figcaption className="lumina-printed-caption static">{caption}</figcaption> : null
      )}
      {dateLabel && <div className="lumina-printed-meta">{dateLabel}</div>}
    </NodeViewWrapper>
  );
}
