/**
 * Filename & display-name helpers.
 *
 * We separate the user-facing "displayName" from the immutable
 * "originalFilename" that came from `file.name` at upload time.
 *
 * Rules:
 *   - Images / videos / audio → hide the extension.
 *   - Documents & everything else → keep the extension visible.
 */

const IMAGE_EXT = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif",
  "bmp", "tif", "tiff", "svg",
]);
const VIDEO_EXT = new Set(["mp4", "mov", "mkv", "webm", "avi", "m4v", "3gp"]);
const AUDIO_EXT = new Set(["mp3", "m4a", "wav", "aac", "flac", "ogg", "oga", "opus", "wma"]);

const HIDDEN_EXT = new Set<string>([...IMAGE_EXT, ...VIDEO_EXT, ...AUDIO_EXT]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0 || i === name.length - 1) return "";
  return name.slice(i + 1).toLowerCase();
}

/**
 * Strip the extension from a filename only when it belongs to a media type
 * where the extension adds no useful information (images / video / audio).
 * Document extensions (.pdf, .pptx, .xlsx, .docx…) are preserved.
 */
export function stripMediaExtension(name: string): string {
  if (!name) return name;
  const ext = extOf(name);
  if (!ext) return name;
  if (HIDDEN_EXT.has(ext)) return name.slice(0, name.length - ext.length - 1);
  return name;
}

/**
 * Choose the initial displayName for a freshly-uploaded file.
 * MIME is used as a tiebreaker so files without a useful extension still
 * end up with a clean name.
 */
export function initialDisplayName(fileName: string, mime?: string): string {
  const stripped = stripMediaExtension(fileName);
  if (stripped !== fileName) return stripped;
  if (mime && (mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/"))) {
    // Extension was missing/unknown but the file is media — just trust the name.
    return fileName;
  }
  return fileName;
}

/**
 * Does the given query match either the display name or the original filename?
 */
export function matchesFilename(query: string, displayName?: string | null, originalFilename?: string | null): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const d = (displayName || "").toLowerCase();
  const o = (originalFilename || "").toLowerCase();
  return d.includes(q) || o.includes(q);
}
