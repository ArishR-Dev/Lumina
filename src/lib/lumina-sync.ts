import { useEffect, useRef } from "react";
import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import { useLumina, bindLuminaStoreToUser, setLuminaStorageOwner } from "@/lib/lumina-store";
import { useAuth } from "@/lib/lumina-auth";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Status = "idle" | "syncing" | "synced" | "offline" | "error";

type SyncState = {
  status: Status;
  online: boolean;
  lastSyncedAt: number | null;
  message: string | null;
  pendingCount: number;
  set: (patch: Partial<Omit<SyncState, "set">>) => void;
};

export const useSyncStatus = create<SyncState>((set) => ({
  status: "idle",
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  lastSyncedAt: null,
  message: null,
  pendingCount: 0,
  set: (patch) => set(patch),
}));

/* ------------------------------------------------------------------ *
 *  Entity map — every collection in lumina-store synced per-record.
 * ------------------------------------------------------------------ */

type LuminaState = ReturnType<typeof useLumina.getState>;

type CollectionKey =
  | "notes"
  | "journal"
  | "thoughts"
  | "letters"
  | "memories"
  | "tasks"
  | "habits"
  | "moods"
  | "customMoods"
  | "capsules";

const COLLECTIONS: { key: CollectionKey; entity: string; idOf: (r: any) => string }[] = [
  { key: "notes", entity: "note", idOf: (r) => r.id },
  { key: "journal", entity: "journal", idOf: (r) => r.id },
  { key: "thoughts", entity: "thought", idOf: (r) => r.id },
  { key: "letters", entity: "letter", idOf: (r) => r.id },
  { key: "memories", entity: "memory", idOf: (r) => r.id },
  { key: "tasks", entity: "task", idOf: (r) => r.id },
  { key: "habits", entity: "habit", idOf: (r) => r.id },
  // moods keyed by date (unique-per-date in store)
  { key: "moods", entity: "mood", idOf: (r) => r.date },
  { key: "customMoods", entity: "custom_mood", idOf: (r) => r.id },
  { key: "capsules", entity: "capsule", idOf: (r) => r.id },
];


// Scalar preferences stored under a single row.
const PREFS_ENTITY = "prefs";
const PREFS_ID = "self";

function pickPrefs(s: LuminaState) {
  return {
    name: s.name,
    theme: s.theme,
    dark: s.dark,
    density: s.density,
    fontScale: s.fontScale,
    scratch: s.scratch,
    recentSearches: s.recentSearches,
  };
}

/* ------------------------------------------------------------------ *
 *  Shadow map: last-synced JSON per (entity:id) — used to compute a
 *  minimal diff on every store change.
 * ------------------------------------------------------------------ */

type ShadowKey = `${string}:${string}`;
const shadow = new Map<ShadowKey, string>();
const key = (entity: string, id: string): ShadowKey => `${entity}:${id}` as ShadowKey;

let applyingRemote = false;
let bootRan = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let diffTimer: ReturnType<typeof setTimeout> | null = null;
let channel: RealtimeChannel | null = null;
let unsubStore: (() => void) | null = null;

// Pending upserts / deletes, keyed by shadow key, flushed together.
type PendingRow = {
  entity: string;
  record_id: string;
  data: unknown;
  deleted: boolean;
};
const pending = new Map<ShadowKey, PendingRow>();
// Local record_ids we just wrote — used to ignore Realtime echoes.
const recentEchoes = new Map<ShadowKey, number>();

function markEcho(entity: string, id: string) {
  recentEchoes.set(key(entity, id), Date.now());
  // Trim old echoes
  if (recentEchoes.size > 500) {
    const cutoff = Date.now() - 5000;
    for (const [k, t] of recentEchoes) if (t < cutoff) recentEchoes.delete(k);
  }
}
function isEcho(entity: string, id: string) {
  const t = recentEchoes.get(key(entity, id));
  return !!t && Date.now() - t < 4000;
}

/* ------------------------------------------------------------------ *
 *  Diff local store against shadow to produce pending rows.
 *
 *  Serializations are memoized by object identity. Store updates are
 *  immutable (updateNote returns new object refs only for mutated
 *  records), so unchanged records reuse the cached JSON and only the
 *  edited record incurs a fresh JSON.stringify.
 * ------------------------------------------------------------------ */

const serialCache = new WeakMap<object, string>();
function serializeRecord(rec: object): string {
  const hit = serialCache.get(rec);
  if (hit !== undefined) return hit;
  const s = JSON.stringify(rec);
  serialCache.set(rec, s);
  return s;
}

function diffState(state: LuminaState, prev?: LuminaState | null) {
  const seen = new Set<ShadowKey>();

  for (const c of COLLECTIONS) {
    const list = (state[c.key] as unknown as unknown[]) ?? [];
    // Fast path: if the collection slice hasn't changed by reference since
    // the previous diff, no record in it can have changed. Still populate
    // `seen` so tombstoning below doesn't wipe them out.
    const prevList = prev ? ((prev[c.key] as unknown as unknown[]) ?? null) : null;
    const unchanged = prevList !== null && prevList === list;
    for (const raw of list) {
      const rec = raw as { [k: string]: unknown };
      const id = c.idOf(rec);
      const k = key(c.entity, id);
      seen.add(k);
      if (unchanged) continue;
      const serial = serializeRecord(rec);
      if (shadow.get(k) !== serial) {
        pending.set(k, { entity: c.entity, record_id: id, data: rec, deleted: false });
      }
    }
  }

  // Prefs (single row) — pickPrefs returns a fresh object each call so
  // the WeakMap cache doesn't help; stringify unconditionally.
  const prefs = pickPrefs(state);
  const pk = key(PREFS_ENTITY, PREFS_ID);
  seen.add(pk);
  const pSerial = JSON.stringify(prefs);
  if (shadow.get(pk) !== pSerial) {
    pending.set(pk, { entity: PREFS_ENTITY, record_id: PREFS_ID, data: prefs, deleted: false });
  }

  // Tombstone anything in shadow but no longer in the store.
  for (const k of shadow.keys()) {
    if (seen.has(k)) continue;
    const [entity, id] = k.split(":") as [string, string];
    if (entity === PREFS_ENTITY) continue; // never delete prefs
    pending.set(k, { entity, record_id: id, data: {}, deleted: true });
  }
}


/* ------------------------------------------------------------------ *
 *  Push pending rows to cloud.
 * ------------------------------------------------------------------ */

async function flushPending(userId: string) {
  if (!useSyncStatus.getState().online) return;
  if (pending.size === 0) {
    useSyncStatus.getState().set({ status: "synced", lastSyncedAt: Date.now(), pendingCount: 0 });
    return;
  }
  const rows = [...pending.values()].map((r) => ({
    user_id: userId,
    entity: r.entity,
    record_id: r.record_id,
    data: r.data as never,
    deleted: r.deleted,
  }));
  // Snapshot keys before we clear pending, so we can prune shadow on success.
  const flushing = [...pending.entries()];
  pending.clear();
  useSyncStatus.getState().set({ status: "syncing", pendingCount: rows.length });

  const { error } = await supabase
    .from("sync_docs")
    .upsert(rows, { onConflict: "user_id,entity,record_id" });
  if (error) {
    // Restore pending so we retry later.
    for (const [k, r] of flushing) if (!pending.has(k)) pending.set(k, r);
    useSyncStatus.getState().set({ status: "error", message: error.message, pendingCount: pending.size });
    return;
  }
  for (const [k, r] of flushing) {
    markEcho(r.entity, r.record_id);
    if (r.deleted) shadow.delete(k);
    else shadow.set(k, JSON.stringify(r.data));
  }
  useSyncStatus.getState().set({
    status: pending.size === 0 ? "synced" : "syncing",
    lastSyncedAt: Date.now(),
    message: null,
    pendingCount: pending.size,
  });
}

function schedulePush(userId: string, delay = 300) {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void flushPending(userId);
  }, delay);
}


/* ------------------------------------------------------------------ *
 *  Apply a single remote row into the local store.
 *
 *  Instrumented: every incoming row is validated (entity known, id
 *  present, data is a plain object with the expected id/date key) and
 *  the observation is logged to window.__luminaSyncLog for debugging.
 *  On validation failure we capture a stack trace and drop the row
 *  rather than corrupting the store.
 * ------------------------------------------------------------------ */

type SyncLogEntry = {
  t: number;
  entity: string;
  record_id: string;
  deleted: boolean;
  keys: string[];
  valid: boolean;
  reason?: string;
  stack?: string;
};

declare global {
  interface Window {
    __luminaSyncLog?: SyncLogEntry[];
  }
}

function pushSyncLog(entry: SyncLogEntry) {
  if (typeof window === "undefined") return;
  const log = (window.__luminaSyncLog ||= []);
  log.push(entry);
  if (log.length > 500) log.splice(0, log.length - 500);
  if (!entry.valid) {
    // Surface invalid rows loudly so the regression suite / devtools catch them.
     
    console.warn("[lumina-sync] invalid remote row", entry);
  }
}

function validateRemoteRow(row: {
  entity: string;
  record_id: string;
  data: Record<string, unknown>;
  deleted: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (!row.entity || typeof row.entity !== "string") return { ok: false, reason: "missing entity" };
  if (!row.record_id || typeof row.record_id !== "string") return { ok: false, reason: "missing record_id" };
  if (row.deleted) return { ok: true };
  if (!row.data || typeof row.data !== "object" || Array.isArray(row.data)) {
    return { ok: false, reason: "data is not an object" };
  }
  if (row.entity === PREFS_ENTITY) return { ok: true };
  const c = COLLECTIONS.find((x) => x.entity === row.entity);
  if (!c) return { ok: false, reason: `unknown entity "${row.entity}"` };
  const localId = c.idOf(row.data);
  if (!localId) return { ok: false, reason: "record has no id/date key" };
  if (localId !== row.record_id) {
    return { ok: false, reason: `id mismatch: row.record_id=${row.record_id} data.id=${localId}` };
  }
  return { ok: true };
}

function applyRemoteRow(row: {
  entity: string;
  record_id: string;
  data: Record<string, unknown>;
  deleted: boolean;
}) {
  const check = validateRemoteRow(row);
  if (!check.ok) {
    pushSyncLog({
      t: Date.now(),
      entity: row.entity,
      record_id: row.record_id,
      deleted: row.deleted,
      keys: row.data ? Object.keys(row.data) : [],
      valid: false,
      reason: check.reason,
      stack: new Error("invalid remote row").stack,
    });
    return;
  }
  pushSyncLog({
    t: Date.now(),
    entity: row.entity,
    record_id: row.record_id,
    deleted: row.deleted,
    keys: row.data ? Object.keys(row.data) : [],
    valid: true,
  });

  applyingRemote = true;
  try {
    const state = useLumina.getState();
    const patch: Partial<LuminaState> = {};

    if (row.entity === PREFS_ENTITY) {
      Object.assign(patch, row.data);
      useLumina.setState(patch as LuminaState);
      shadow.set(key(PREFS_ENTITY, PREFS_ID), JSON.stringify(pickPrefs({ ...state, ...patch } as LuminaState)));
      return;
    }

    const c = COLLECTIONS.find((x) => x.entity === row.entity);
    if (!c) return;
    const list = ((state[c.key] as unknown as unknown[]) ?? []).slice() as { [k: string]: unknown }[];
    const idx = list.findIndex((r) => c.idOf(r) === row.record_id);

    if (row.deleted) {
      if (idx >= 0) list.splice(idx, 1);
      shadow.delete(key(row.entity, row.record_id));
    } else {
      if (idx >= 0) list[idx] = row.data as never;
      else list.unshift(row.data as never);
      shadow.set(key(row.entity, row.record_id), JSON.stringify(row.data));
    }
    (patch as Record<string, unknown>)[c.key] = list;
    useLumina.setState(patch as LuminaState);
  } catch (err) {
    pushSyncLog({
      t: Date.now(),
      entity: row.entity,
      record_id: row.record_id,
      deleted: row.deleted,
      keys: row.data ? Object.keys(row.data) : [],
      valid: false,
      reason: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  } finally {
    queueMicrotask(() => {
      applyingRemote = false;
    });
  }
}


/* ------------------------------------------------------------------ *
 *  Initial sync — fetch every row for the user and merge with local.
 *  Rules:
 *   - Row exists remotely and locally: remote wins (LWW at doc level).
 *   - Row exists locally only: schedule an upsert.
 *   - Row deleted remotely: remove from local store.
 * ------------------------------------------------------------------ */

async function initialSync(userId: string) {
  // Never merge another account's leftover local cache into this user's cloud.
  bindLuminaStoreToUser(userId);

  useSyncStatus.getState().set({ status: "syncing" });

  const { data, error } = await supabase
    .from("sync_docs")
    .select("entity, record_id, data, deleted, updated_at")
    .eq("user_id", userId);

  if (error) {
    useSyncStatus.getState().set({ status: "error", message: error.message });
    return;
  }

  // Build remote index.
  const remote = new Map<ShadowKey, { data: Record<string, unknown>; deleted: boolean }>();
  for (const row of data ?? []) {
    remote.set(key(row.entity, row.record_id), {
      data: (row.data as Record<string, unknown>) ?? {},
      deleted: !!row.deleted,
    });
  }

  applyingRemote = true;
  try {
    const state = useLumina.getState();
    const patch: Partial<LuminaState> = {};

    for (const c of COLLECTIONS) {
      const local = ((state[c.key] as unknown as unknown[]) ?? []).slice() as { [k: string]: unknown }[];
      const merged: { [k: string]: unknown }[] = [];
      const seenIds = new Set<string>();

      // Apply remote as source of truth for anything remote knows about.
      for (const [k, v] of remote) {
        const [entity, id] = k.split(":");
        if (entity !== c.entity) continue;
        seenIds.add(id);
        if (v.deleted) {
          shadow.delete(k);
        } else {
          merged.push(v.data);
          shadow.set(k, JSON.stringify(v.data));
        }
      }
      // Keep local-only records (schedule push) — only for this account's edits
      // after bind (owner already matches; local starts empty on account switch).
      for (const rec of local) {
        const id = c.idOf(rec);
        if (seenIds.has(id)) continue;
        merged.push(rec);
        pending.set(key(c.entity, id), {
          entity: c.entity,
          record_id: id,
          data: rec,
          deleted: false,
        });
      }
      (patch as Record<string, unknown>)[c.key] = merged;
    }

    // Prefs
    const pk = key(PREFS_ENTITY, PREFS_ID);
    const remotePrefs = remote.get(pk);
    if (remotePrefs && !remotePrefs.deleted) {
      Object.assign(patch, remotePrefs.data);
      shadow.set(pk, JSON.stringify(remotePrefs.data));
    } else {
      // seed cloud with local prefs
      const p = pickPrefs({ ...state, ...patch } as LuminaState);
      pending.set(pk, { entity: PREFS_ENTITY, record_id: PREFS_ID, data: p, deleted: false });
    }

    useLumina.setState(patch as LuminaState);
    setLuminaStorageOwner(userId);
  } finally {
    queueMicrotask(() => {
      applyingRemote = false;
    });
  }

  if (pending.size > 0) {
    await flushPending(userId);
  } else {
    useSyncStatus.getState().set({ status: "synced", lastSyncedAt: Date.now(), pendingCount: 0 });
  }
}

/* ------------------------------------------------------------------ *
 *  Public hook — mounts sync engine, tears down on sign-out.
 * ------------------------------------------------------------------ */

export function useLuminaSync() {
  const user = useAuth((s) => s.user);
  const ref = useRef<string | null>(null);

  useEffect(() => {
    const onOn = () => {
      useSyncStatus.getState().set({ online: true });
      if (user) schedulePush(user.id, 200);
    };
    const onOff = () => useSyncStatus.getState().set({ online: false, status: "offline" });
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
      if (unsubStore) {
        unsubStore();
        unsubStore = null;
      }
      shadow.clear();
      pending.clear();
      bootRan = false;
      ref.current = null;
      useSyncStatus.getState().set({ status: "idle", lastSyncedAt: null, pendingCount: 0 });
      return;
    }
    if (bootRan && ref.current === user.id) return;
    ref.current = user.id;
    bootRan = true;

    void initialSync(user.id);

    let lastDiffed: LuminaState | null = null;
    unsubStore = useLumina.subscribe((state) => {
      if (applyingRemote) return;
      // Coalesce diffing across bursts of keystrokes. Only 120ms of idle
      // is needed because diffState now skips collections whose slice
      // reference is unchanged, so a burst of edits on one list barely
      // touches the others.
      if (diffTimer) clearTimeout(diffTimer);
      diffTimer = setTimeout(() => {
        diffTimer = null;
        const wasEmpty = pending.size === 0;
        diffState(state, lastDiffed);
        lastDiffed = state;
        if (pending.size > 0) {
          useSyncStatus.getState().set({ pendingCount: pending.size });
          // First change in a burst flushes fast; further changes within
          // the burst coalesce into the same flush window.
          schedulePush(user.id, wasEmpty ? 120 : 300);
        }
      }, 120);
    });


    channel = supabase
      .channel(`sync-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_docs",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            entity: string;
            record_id: string;
            data: Record<string, unknown>;
            deleted: boolean;
          } | null;
          if (!row) return;
          if (isEcho(row.entity, row.record_id)) return;
          applyRemoteRow({
            entity: row.entity,
            record_id: row.record_id,
            data: row.data ?? {},
            deleted: payload.eventType === "DELETE" ? true : !!row.deleted,
          });
          useSyncStatus.getState().set({ status: "synced", lastSyncedAt: Date.now() });
        },
      )
      .subscribe();

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
      if (unsubStore) {
        unsubStore();
        unsubStore = null;
      }
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      if (diffTimer) {
        clearTimeout(diffTimer);
        diffTimer = null;
      }
      bootRan = false;
      ref.current = null;
    };
  }, [user]);
}

/* ------------------------------------------------------------------ *
 *  Public API — flush pending sync (e.g. beforeunload helpers).
 * ------------------------------------------------------------------ */

export function forceFlush() {
  const user = useAuth.getState().user;
  if (!user) return Promise.resolve();
  diffState(useLumina.getState());
  return flushPending(user.id);
}
