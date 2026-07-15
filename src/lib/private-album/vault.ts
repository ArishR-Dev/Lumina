/**
 * Lumina Private Album — client-side vault backed by IndexedDB.
 *
 * All files live locally in the browser. Nothing is uploaded to any server.
 * Two object stores: `meta` (indexed metadata) and `blob` (raw file blobs
 * keyed by the same id). This lets us list/search/sort without loading blobs.
 */

const DB_NAME = "lumina-private-album";
const DB_VERSION = 1;
const META = "meta";
const BLOB = "blob";

export type VaultKind = "image" | "video" | "audio" | "note" | "document" | "other";

export type VaultItem = {
  id: string;
  /** User-facing display name. Rename edits this field only. */
  name: string;
  kind: VaultKind;
  mime: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  /** Only for kind === "note" — inline text content, no blob. */
  text?: string;
  /** Optional data-URL thumbnail for grids (images / video posters). */
  thumb?: string;
  /** Immutable original filename from upload. Never mutated by rename. */
  originalFilename?: string;
};


let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) {
        const s = db.createObjectStore(META, { keyPath: "id" });
        s.createIndex("createdAt", "createdAt");
        s.createIndex("updatedAt", "updatedAt");
        s.createIndex("favorite", "favorite");
      }
      if (!db.objectStoreNames.contains(BLOB)) {
        db.createObjectStore(BLOB);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T> | T): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result: T;
    Promise.resolve(fn(t)).then((r) => { result = r; }).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function uid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function detectKind(mime: string): VaultKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime.includes("word") ||
    mime.includes("sheet") ||
    mime.includes("presentation")
  ) return "document";
  return "other";
}

async function makeThumb(file: File, kind: VaultKind): Promise<string | undefined> {
  try {
    if (kind === "image") {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.decoding = "async";
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("image load"));
        img.src = url;
      });
      const max = 320;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return undefined;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      return c.toDataURL("image/jpeg", 0.7);
    }
    if (kind === "video") {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.src = url;
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error("video load"));
      });
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
      await new Promise<void>((res) => { v.onseeked = () => res(); });
      const max = 320;
      const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
      const w = Math.max(1, Math.round(v.videoWidth * scale));
      const h = Math.max(1, Math.round(v.videoHeight * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return undefined;
      ctx.drawImage(v, 0, 0, w, h);
      URL.revokeObjectURL(url);
      return c.toDataURL("image/jpeg", 0.6);
    }
  } catch {
    // ignore — thumbs are best-effort
  }
  return undefined;
}

export const vault = {
  async list(): Promise<VaultItem[]> {
    return tx([META], "readonly", async (t) => {
      const items = await req(t.objectStore(META).getAll() as IDBRequest<VaultItem[]>);
      return items.sort((a, b) => b.createdAt - a.createdAt);
    });
  },

  async get(id: string): Promise<VaultItem | undefined> {
    return tx([META], "readonly", (t) => req(t.objectStore(META).get(id) as IDBRequest<VaultItem | undefined>));
  },

  async getBlobUrl(id: string): Promise<string | null> {
    const blob = await tx([BLOB], "readonly", (t) => req(t.objectStore(BLOB).get(id) as IDBRequest<Blob | undefined>));
    return blob ? URL.createObjectURL(blob) : null;
  },

  async addFile(file: File): Promise<VaultItem> {
    const kind = detectKind(file.type || "");
    const thumb = await makeThumb(file, kind);
    const now = Date.now();
    const originalFilename = file.name || "Untitled";
    // Hide extension only for image/video/audio; keep it on documents.
    const displayName =
      kind === "image" || kind === "video" || kind === "audio"
        ? originalFilename.replace(/\.[^.]+$/, "") || originalFilename
        : originalFilename;
    const item: VaultItem = {
      id: uid(),
      name: displayName,
      kind,
      mime: file.type || "application/octet-stream",
      size: file.size,
      createdAt: now,
      updatedAt: now,
      favorite: false,
      thumb,
      originalFilename,
    };
    await tx([META, BLOB], "readwrite", (t) => {
      t.objectStore(META).put(item);
      t.objectStore(BLOB).put(file, item.id);
    });
    return item;
  },


  async addNote(name: string, text: string): Promise<VaultItem> {
    const now = Date.now();
    const item: VaultItem = {
      id: uid(),
      name: name || "Untitled note",
      kind: "note",
      mime: "text/plain",
      size: new Blob([text]).size,
      createdAt: now,
      updatedAt: now,
      favorite: false,
      text,
    };
    await tx([META], "readwrite", (t) => { t.objectStore(META).put(item); });
    return item;
  },

  async rename(id: string, name: string): Promise<void> {
    const cur = await this.get(id);
    if (!cur) return;
    await tx([META], "readwrite", (t) => {
      t.objectStore(META).put({ ...cur, name, updatedAt: Date.now() });
    });
  },

  async toggleFavorite(id: string): Promise<void> {
    const cur = await this.get(id);
    if (!cur) return;
    await tx([META], "readwrite", (t) => {
      t.objectStore(META).put({ ...cur, favorite: !cur.favorite, updatedAt: Date.now() });
    });
  },

  async remove(id: string): Promise<void> {
    await tx([META, BLOB], "readwrite", (t) => {
      t.objectStore(META).delete(id);
      t.objectStore(BLOB).delete(id);
    });
  },

  async clear(): Promise<void> {
    await tx([META, BLOB], "readwrite", (t) => {
      t.objectStore(META).clear();
      t.objectStore(BLOB).clear();
    });
  },
};
