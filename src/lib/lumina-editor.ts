import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Callout: a soft, notion-style block with an emoji and pastel background.
 * Serialises as <div data-callout emoji="💡">…</div>.
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      emoji: {
        default: "💡",
        parseHTML: (el) => el.getAttribute("data-emoji") || "💡",
        renderHTML: (attrs) => ({ "data-emoji": attrs.emoji }),
      },
      tone: {
        default: "note",
        parseHTML: (el) => el.getAttribute("data-tone") || "note",
        renderHTML: (attrs) => ({ "data-tone": attrs.tone }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-callout": "true", class: "lumina-callout" }),
      ["span", { class: "lumina-callout-emoji", contenteditable: "false" }, HTMLAttributes["data-emoji"] || "💡"],
      ["div", { class: "lumina-callout-body" }, 0],
    ];
  },
});

export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: "Feelings", emojis: ["🌸","✨","💖","🥰","😊","🥺","🌷","☕","🌙","⭐","💫","🫶","🌈","🕊️","🍃"] },
  { label: "Focus", emojis: ["📝","📖","✏️","📚","🗒️","🔖","🖋️","💡","🎯","✅","⏳","🧠","📌","🗂️","🕯️"] },
  { label: "Nature", emojis: ["🌿","🍂","🌻","🌼","🌊","☁️","🌤️","🌧️","❄️","🌾","🍓","🍑","🌺","🪷","🌱"] },
  { label: "Cozy", emojis: ["🧸","🍵","🍪","🎀","🕰️","🪴","🎐","🪞","📮","💌","🧺","🛋️","🫧","🪄","🎠"] },
];
