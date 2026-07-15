import { Node, mergeAttributes } from "@tiptap/core";

/**
 * `luminaLink` — an inline chip that references another Lumina entity
 * (memory / journal / note / letter / thought / capsule / farewell / timeline).
 *
 * Attributes:
 *   kind    — entity kind
 *   refId   — entity id (or date, for journal)
 *   label   — display text
 *   emoji   — small icon emoji
 *   href    — resolved route
 */
export const LuminaLink = Node.create({
  name: "luminaLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      kind: { default: "note" },
      refId: { default: "" },
      label: { default: "Reference" },
      emoji: { default: "🔖" },
      href: { default: "#" },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-lumina-chip]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-lumina-chip": "true",
        "data-kind": node.attrs.kind,
        "data-ref": node.attrs.refId,
        href: node.attrs.href || "#",
        class: "lumina-chip",
      }),
      ["span", { class: "lumina-chip-icon" }, node.attrs.emoji || "🔖"],
      ["span", {}, node.attrs.label || "Reference"],
    ];
  },
});
