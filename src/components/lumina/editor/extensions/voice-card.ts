import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { VoiceCardView } from "../nodes/VoiceCardView";

/**
 * Voice memory block. Storage is delegated to `@/lib/farewell/voice`
 * keyed by `voiceId` — that key survives note copies and lets us clean
 * up recordings when the block is removed.
 */
export const VoiceCard = Node.create({
  name: "voiceCard",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      voiceId: { default: "" },
      title: { default: "" },
      duration: { default: 0 },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-lumina-voice]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-lumina-voice": "true",
        "data-voice-id": node.attrs.voiceId,
        "data-title": node.attrs.title,
        "data-duration": String(node.attrs.duration || 0),
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VoiceCardView);
  },
});
