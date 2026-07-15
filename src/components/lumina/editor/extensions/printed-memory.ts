import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { PrintedMemoryView } from "../nodes/PrintedMemoryView";

/**
 * Printed Memory — a framed image with caption and captured-date meta.
 * Distinct from the legacy `image` node so existing notes keep rendering
 * their bare <img> tags unchanged; new insertions use this richer node.
 */
export const PrintedMemory = Node.create({
  name: "printedMemory",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: "" },
      caption: { default: "" },
      capturedAt: { default: 0 },
      width: { default: 0 },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-lumina-printed]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const width = Number(node.attrs.width) || 0;
    const attrs = mergeAttributes(HTMLAttributes, {
      "data-lumina-printed": "true",
      "data-captured-at": String(node.attrs.capturedAt || 0),
      class: "lumina-printed",
    });
    const frameStyle = width ? `width:${width}px` : "";
    return [
      "figure",
      attrs,
      [
        "div",
        { class: "lumina-printed-frame", style: frameStyle },
        ["img", { src: node.attrs.src, alt: node.attrs.caption || "Printed memory", loading: "lazy" }],
      ],
      ...(node.attrs.caption
        ? [["figcaption", { class: "lumina-printed-caption static" }, node.attrs.caption]]
        : []) as never[],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PrintedMemoryView);
  },
});
