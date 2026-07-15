# Living Paper — Lumina's Signature Writing Experience

Refined plan incorporating your feedback. The engine stays Tiptap; the identity becomes unmistakably Lumina.

## Naming (branded, not descriptive)

- Surface: **Living Paper** (the canvas itself)
- Floating selection UI: **Writer's Palette**
- `/` menu: **Lumina Inserts**
- `@` menu: **Lumina Mentions**
- Voice block: **Voice Memory**
- Image block: **Printed Memory**

Class names + data attributes mirror these: `data-lumina="living-paper"`, `.writers-palette`, `.lumina-inserts`.

## 1. Living Paper Canvas

Cream surface, soft grain, folded-light gradient, 28px radius.

**Reactive paper** (subtle, not animated everywhere):
- `mousemove` on the canvas nudges a CSS variable `--paper-tilt-x/y` (±0.4deg max) driving the outer shadow angle + a faint highlight gradient. Throttled to `requestAnimationFrame`, disabled under `prefers-reduced-motion`.
- Caret movement shifts a very soft radial light (`--caret-x/y` → 400px radius, 3% luminance lift) so the page feels lit by the cursor.
- No parallax, no tilt on the text — only shadow + light layer transform.

## 2. Empty State (the Lumina hello)

Blank note renders — no title input, no "Write…" placeholder:

```
──────────────────────
   Good evening
   Monday · July 13
──────────────────────
   This page is yours.
──────────────────────
```

- Greeting resolves from local time (morning/afternoon/evening/late).
- Date via `Intl.DateTimeFormat`.
- Divider is a hairline `oklch(0.28 0.04 320 / 0.14)`.
- Fades to 40% opacity once the user types the first character; fully hidden after 2 characters.

## 3. Contextual Placeholders (no AI)

When the doc is empty and the greeting fades on focus, the caret line shows a rotating contextual prompt based on time-of-day + optional mood tag on the note:

- Morning: *What's on your mind this morning?*
- Afternoon: *A thought worth keeping?*
- Evening: *Leave today's thoughts here.*
- Late night: *Quiet hours. Write freely.*
- mood=sad: *Some thoughts are easier to write.*
- mood=happy: *Capture this feeling before it fades.*
- mood=grateful: *What are you holding onto tonight?*

Implemented as a Tiptap Placeholder extension with a resolver function; picks once per focus, no cycling flicker.

## 4. Writer's Palette (floating selection UI)

Groups instead of a flat row — labels, not just glyphs:

```
[ Style ▾ ]  [ Highlight ]  [ Quote ]  |  [ Voice ]  [ Memory ]  [ Link ]  [ ⋯ ]
```

- **Style** dropdown: Title, Heading, Body, Callout, Code.
- **Highlight**: 3 warm pastel swatches (peach / sage / lilac) tuned to paper.
- **Quote**: inline pull-quote with a hand-drawn left rule (SVG stroke-dash draw-in).
- **Voice / Memory / Link**: primary Lumina inserts promoted into the palette.
- **⋯**: overflow (strike, code, clear).

Glass surface, 12px radius, 220ms ease-out enter with 6px lift. Cursor-aware placement (Tippy). Mobile variant docks above the keyboard.

## 5. Lumina Inserts (`/` menu)

Big cards, two-line, emotional copy — not Notion's compact list:

```
🎙  Voice Memory        Record something.
📷  Printed Memory      Attach a moment.
💌  Letter              Write to someone.
🕊  Farewell            Release something.
🗓  Timeline Event      Mark a day.
⏳  Capsule             Send a message forward.
✅  Task                Something to do.
❞  Quote               A line worth keeping.
```

Keyboard-first (↑ ↓ ↵), fuzzy filter, grouped by *Create* / *Attach* / *Text*.

## 6. Lumina Mentions (`@` menu — new)

Typing `@` opens an autocomplete of the user's own Lumina world:

- Memory
- Capsule
- Journal Entry
- Farewell
- Thought
- Task
- Letter
- Person (from contacts / recipients)

Selecting inserts a `luminaLink` node (chip) with `kind + refId + label`, navigates to `/app/…` on click. Data source: existing `useLumina` store — no new tables.

## 7. Voice Memory card

Beyond waveform + play:

- Handwritten-style label (Caveat font): `Recorded · Today · 8:43 PM`
- Relative-time updates (`today`, `yesterday`, `Mon 14 Jul`)
- Optional one-line caption input under the waveform
- Playhead glows with primary color; scrubbable
- Storage: existing `saveVoice()` / block UUID — unchanged

## 8. Printed Memory (image block)

- Printed-photo frame: 20px radius, ~10px paper border, soft drop shadow
- Caption input (italic Fraunces 18) under the image
- Tiny meta row: `Jul 13, 2026 · optional location` (location optional, from EXIF if present, otherwise a small "add place" affordance)
- Corner-handle resize; `contrast(1.02) saturate(1.05)` filter for the printed feel

## 9. Immersive Typing

- On focus, chrome (top nav, sidebar hint, palette when idle) fades to 0 via `data-writing="true"` on the route.
- Selection, mouse move, or Cmd/Ctrl restores chrome at 220ms.
- Palette hides while typing, reappears on selection.

## 10. Motion + Performance

- 220–320ms cubic-bezier(0.22, 0.9, 0.32, 1) throughout.
- All transforms GPU-composited (`translate3d`).
- Paper reactive layers throttled to rAF, gated by `prefers-reduced-motion`.
- Palette memoized on `selectionUpdate`.
- Slash / mention lists virtualize past 40 items.
- Waveform bars cached per voice card.

## File layout (unchanged from prior audit, renamed)

```
src/components/lumina/editor/
  LivingPaper.tsx            (top-level, owns Tiptap instance)
  PaperCanvas.tsx            (reactive surface + light layer)
  WritersPalette.tsx         (floating selection UI)
  LuminaInserts.tsx          (/ menu — big cards)
  LuminaMentions.tsx         (@ menu — Lumina world)
  MobilePalette.tsx          (keyboard-docked variant)
  LinkPopover.tsx
  EmptyState.tsx             (greeting + date + "This page is yours.")
  nodes/
    VoiceMemory.tsx
    PrintedMemory.tsx
    LuminaLink.tsx
    InkTaskItem.tsx
  extensions/
    voice-memory.ts
    printed-memory.ts
    lumina-link.ts
    lumina-inserts.ts        (slash suggestion)
    lumina-mentions.ts       (mention suggestion)
    contextual-placeholder.ts
  paper.css
  index.ts
```

Existing `RichEditor.tsx` becomes a thin re-export → `LivingPaper` so notes, letters, focus mode, mobile editor, and journal previews inherit the new experience automatically.

## What stays untouched

Routing, `useLumina` store, autosave / versions, `FocusMode`, `ReadingMode`, voice storage (`voice.ts`), waveform renderer, design tokens, Cloud schemas.

## Packages to add

`@tiptap/extension-bubble-menu`, `@tiptap/extension-highlight`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-mention`, `@tiptap/suggestion`, `tippy.js`.

## Out of scope this pass

Tables, real-time collaboration, server-side waveform rendering, mood-tag UI (contextual placeholders will read `note.mood` if it already exists, else fall back to time-of-day only).

---

Approve this and I'll implement it end-to-end, or tell me which sections to trim / expand first.
