// The Ashes vault. When a Farewell reaches the point of no return, the
// entity is soft-deleted here for 30 days. This is the persistent side of
// the ritual: undo path, telemetry, and a place to grieve intentionally.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RitualId } from "./copy";

export type AshEntityType =
  | "note"
  | "letter"
  | "memory"
  | "journal"
  | "thought"
  | "mood"
  | "custom";

export type AshEntry = {
  id: string;                       // ash id
  entityType: AshEntityType;
  entityId: string;
  ritual: RitualId;
  releasedAt: number;
  expiresAt: number;                // releasedAt + 30 days
  // A minimal snapshot so restore works even after the source is deleted.
  snapshot: { title: string; content: string };
};

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

type State = {
  ashes: AshEntry[];
  release: (e: Omit<AshEntry, "id" | "releasedAt" | "expiresAt">) => AshEntry;
  restore: (ashId: string) => AshEntry | null;
  forget: (ashId: string) => void;
  sweepExpired: () => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const useAshes = create<State>()(
  persist(
    (set, get) => ({
      ashes: [],
      release: (e) => {
        const entry: AshEntry = {
          id: uid(),
          releasedAt: Date.now(),
          expiresAt: Date.now() + THIRTY_DAYS,
          ...e,
        };
        set({ ashes: [entry, ...get().ashes] });
        return entry;
      },
      restore: (ashId) => {
        const found = get().ashes.find((a) => a.id === ashId);
        if (!found) return null;
        set({ ashes: get().ashes.filter((a) => a.id !== ashId) });
        return found;
      },
      forget: (ashId) => set({ ashes: get().ashes.filter((a) => a.id !== ashId) }),
      sweepExpired: () => {
        const now = Date.now();
        const before = get().ashes.length;
        const kept = get().ashes.filter((a) => a.expiresAt > now);
        if (kept.length !== before) set({ ashes: kept });
      },
    }),
    { name: "lumina-ashes" },
  ),
);

// Sweep on module load in the browser.
if (typeof window !== "undefined") {
  queueMicrotask(() => useAshes.getState().sweepExpired());
}
