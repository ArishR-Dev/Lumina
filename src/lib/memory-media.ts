/**
 * Memory media — IndexedDB-backed blob store for full-resolution photos.
 *
 * ---------------------------------------------------------------------
 * Why this module exists
 * ---------------------------------------------------------------------
 * Historically `Memory.src` held a base64 data URL of the original photo
 * inside the main Zustand record, which persists to localStorage. That
 * shape stringifies the entire library on every keystroke and quickly
 * exceeds the ~5MB localStorage quota once a user adds phone photos.
 *
 * New memories store:
 *   - the original bytes as a Blob in IndexedDB, keyed by `storageKey`
 *   - a small (~360px longest side) WebP/JPEG thumbnail as `thumbnail`
 *     (data URL, embedded in the record for zero-flash list rendering)
 *   - the natural `width` / `height` of the original
 *
 * Lists render the thumbnail. The full-resolution blob is only touched
 * when the viewer opens. Legacy base64 records still render — see
 * `migrateLegacyMemory()` for the transparent on-open migration path.
 */

const DB_NAME = "lumina-memory-media";
const DB_VERSION = 1;
const BLOB = "blob";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOB)) db.createObjectStore(BLOB);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(BLOB, mode);
    const r = fn(t.objectStore(BLOB));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.onabort = () => reject(t.error);
  }));
}

// ---------- Blob storage ----------

export async function putBlob(key: string, blob: Blob): Promise<void> {
  await withStore("readwrite", (s) => s.put(blob, key));
}

export async function getBlob(key: string): Promise<Blob | null> {
  try {
    const b = await withStore<Blob | undefined>("readonly", (s) => s.get(key) as IDBRequest<Blob | undefined>);
    return b ?? null;
  } catch {
    return null;
  }
}

export async function deleteBlob(key: string | undefined | null): Promise<void> {
  if (!key) return;
  try { await withStore("readwrite", (s) => s.delete(key)); }
  catch { /* best-effort */ }
}

// ---------- Data URL helpers ----------

/** base64 data URL → Blob (kept out of the fetch() path so it works in SSR-safe modules too). */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = !!match[2];
  const payload = match[3];
  try {
    if (isBase64) {
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime });
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ---------- Thumbnail generation ----------

export type ThumbnailResult = {
  /** Small WebP (or JPEG fallback) data URL, ~300–400px longest side. */
  thumbnail: string;
  /** Natural width of the ORIGINAL source, not the thumbnail. */
  width: number;
  /** Natural height of the ORIGINAL source, not the thumbnail. */
  height: number;
};

const THUMB_MAX = 360;
const THUMB_QUALITY = 0.72;

/**
 * Decode `source` (Blob or data URL / http URL string) and produce a
 * compressed thumbnail plus the natural dimensions of the original.
 *
 * Prefers WebP; falls back to JPEG if the browser refuses to encode
 * WebP. Uses OffscreenCanvas when available; falls back to a detached
 * `<canvas>`. Returns null if the source cannot be decoded (unsupported
 * format, corrupt bytes, HEIC on Chrome/Firefox, etc.) — callers should
 * fall through to using the legacy `src` field unchanged.
 */
export async function generateThumbnail(source: Blob | string): Promise<ThumbnailResult | null> {
  if (typeof window === "undefined") return null;

  let bitmap: ImageBitmap | HTMLImageElement | null = null;
  let width = 0;
  let height = 0;

  // Try the fast path — createImageBitmap decodes off-thread when available.
  try {
    const blob: Blob | null = typeof source === "string"
      ? (source.startsWith("data:") ? dataUrlToBlob(source) : await fetch(source).then((r) => r.blob()).catch(() => null))
      : source;
    if (blob && "createImageBitmap" in window) {
      bitmap = await createImageBitmap(blob);
      width = bitmap.width;
      height = bitmap.height;
    }
  } catch { /* fall through */ }

  // Fallback: HTMLImageElement decode. Some formats (HEIC) fail here too.
  if (!bitmap) {
    try {
      const url = typeof source === "string" ? source : URL.createObjectURL(source);
      const img = new Image();
      img.decoding = "async";
      const loaded = new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
      });
      img.src = url;
      const ok = await loaded;
      if (typeof source !== "string") URL.revokeObjectURL(url);
      if (!ok) return null;
      bitmap = img;
      width = img.naturalWidth;
      height = img.naturalHeight;
    } catch {
      return null;
    }
  }

  if (!width || !height) return null;

  const scale = Math.min(1, THUMB_MAX / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  let dataUrl: string | null = null;

  // Prefer OffscreenCanvas → toBlob (WebP) when available.
  try {
    const OffscreenCanvasCtor = (window as unknown as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas;
    if (OffscreenCanvasCtor && "convertToBlob" in OffscreenCanvasCtor.prototype) {
      const off = new OffscreenCanvasCtor(outW, outH);
      const ctx = off.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap as CanvasImageSource, 0, 0, outW, outH);
        try {
          const webp = await off.convertToBlob({ type: "image/webp", quality: THUMB_QUALITY });
          dataUrl = await blobToDataUrl(webp);
        } catch {
          const jpeg = await off.convertToBlob({ type: "image/jpeg", quality: THUMB_QUALITY });
          dataUrl = await blobToDataUrl(jpeg);
        }
      }
    }
  } catch { /* fall through */ }

  // Fallback: detached <canvas>.
  if (!dataUrl) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap as CanvasImageSource, 0, 0, outW, outH);
      try {
        dataUrl = canvas.toDataURL("image/webp", THUMB_QUALITY);
        if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", THUMB_QUALITY);
      } catch {
        dataUrl = canvas.toDataURL("image/jpeg", THUMB_QUALITY);
      }
    } catch {
      return null;
    }
  }

  // Release the ImageBitmap so its decoded pixels can be GC'd.
  if (bitmap && "close" in bitmap && typeof (bitmap as ImageBitmap).close === "function") {
    try { (bitmap as ImageBitmap).close(); } catch { /* ignore */ }
  }

  if (!dataUrl) return null;
  return { thumbnail: dataUrl, width, height };
}

// ---------- Upload helper ----------

export type PreparedMedia = {
  storageKey: string;
  thumbnail: string;
  width: number;
  height: number;
};

/**
 * Store the original bytes of `file` in IndexedDB and produce a
 * thumbnail record. Returns null when the image cannot be decoded — the
 * caller should fall back to the legacy base64 path so unusual formats
 * (e.g. HEIC on non-Safari) still upload.
 */
export async function prepareMediaFromFile(file: File): Promise<PreparedMedia | null> {
  const thumb = await generateThumbnail(file);
  if (!thumb) return null;
  const storageKey = crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  await putBlob(storageKey, file);
  return { storageKey, thumbnail: thumb.thumbnail, width: thumb.width, height: thumb.height };
}

// ---------- Full-resolution URL for the viewer ----------

/**
 * Resolve a Memory-shaped record to a full-resolution URL for the
 * viewer. The caller MUST invoke the returned `release()` when the
 * viewer closes so the object URL can be revoked and the decoded bitmap
 * can be garbage-collected.
 *
 *   const { url, release } = await resolveFullImage(memory);
 *   // ...display url...
 *   release();
 */
export type ResolvedImage = { url: string; release: () => void };

export async function resolveFullImage(
  memory: { src?: string; storageKey?: string; mimeType?: string },
): Promise<ResolvedImage | null> {
  if (memory.storageKey) {
    const blob = await getBlob(memory.storageKey);
    if (blob) {
      const url = URL.createObjectURL(blob);
      return { url, release: () => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } } };
    }
  }
  const legacy = memory.src ?? "";
  if (legacy) return { url: legacy, release: () => { /* no-op */ } };
  return null;
}

// ---------- Legacy migration ----------

export type LegacyMigrationResult = {
  storageKey: string;
  thumbnail: string;
  width: number;
  height: number;
};

/**
 * Transparent one-shot migration for legacy memories where the original
 * lives inside `src` as a base64 data URL. Returns the fields to patch
 * onto the record, or null if migration is not applicable.
 *
 * The original blob is moved into IndexedDB. Callers should also clear
 * the legacy `src` field so the base64 payload stops bloating
 * localStorage.
 */
export async function migrateLegacyMemory(
  memory: { src?: string; storageKey?: string },
): Promise<LegacyMigrationResult | null> {
  if (memory.storageKey) return null;
  const src = memory.src ?? "";
  if (!src.startsWith("data:image/")) return null;
  const blob = dataUrlToBlob(src);
  if (!blob) return null;
  const thumb = await generateThumbnail(blob);
  if (!thumb) return null;
  const storageKey = crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  await putBlob(storageKey, blob);
  return { storageKey, thumbnail: thumb.thumbnail, width: thumb.width, height: thumb.height };
}
