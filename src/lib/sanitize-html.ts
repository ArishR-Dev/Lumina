/**
 * HTML sanitizer for TipTap-authored content rendered via
 * `dangerouslySetInnerHTML` (notes, journal, letters, reading mode,
 * printed memory, voice memory).
 *
 * The editor's output is trusted-shape but not trusted content: sync
 * round-trips it through the backend and future sharing/import flows may
 * bring in HTML authored elsewhere. We run DOMPurify over the string
 * before it reaches the DOM.
 *
 * The allow-list mirrors the tags/attrs actually produced by:
 *   - StarterKit                 (p, br, h1..h6, ul, ol, li, blockquote, code, pre, strong, em, s, hr)
 *   - @tiptap/extension-image    (img)
 *   - @tiptap/extension-link     (a)
 *   - LuminaLink node            (<a data-lumina-chip>)
 *   - PrintedMemory node         (<figure data-lumina-printed>)
 *   - VoiceCard node             (<div data-lumina-voice>)
 *
 * Extra data-* attributes are allowed by default in DOMPurify; we call
 * that out explicitly with `ALLOW_DATA_ATTR: true`.
 */

import DOMPurify, { type Config } from "dompurify";

const CONFIG: Config = {
  ALLOWED_TAGS: [
    // Block + inline text
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "em", "u", "s", "sub", "sup", "code", "pre", "kbd",
    "blockquote",
    "ul", "ol", "li",
    // Task list (StarterKit / TipTap default emits <ul data-type="taskList">)
    "input",
    // Links + inline chip
    "a", "span",
    // Media
    "img",
    "figure", "figcaption",
    // Voice memory container
    "div",
    // Table primitives (safe to keep in case a future extension uses them)
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  ],
  ALLOWED_ATTR: [
    "href", "target", "rel",
    "src", "alt", "title", "loading", "width", "height",
    "class", "style",
    "colspan", "rowspan",
    "type", "checked", "disabled",
    "start",
  ],
  ALLOW_DATA_ATTR: true,
  // Never let stored content escape to another origin's namespace.
  FORBID_TAGS: ["script", "iframe", "object", "embed", "meta", "link", "base", "form"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "formaction"],
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Sanitize a stored HTML string before it reaches the DOM.
 * Safe to call with an empty / null value.
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, CONFIG) as unknown as string;
}

