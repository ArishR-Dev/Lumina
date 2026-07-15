// RichEditor re-exports the new signature LuminaEditor so every
// consumer (notes, letters, focus mode, mobile editor) picks up the
// new writing experience without touching import paths.
export { LuminaEditor as RichEditor } from "./editor";
