// Voice memories for Farewell. Each memory (entityKind + entityId) can
// carry one optional spoken recording. We keep it small and local:
// - Recordings live in localStorage as a data URL (base64 audio).
// - Loading returns a plain string usable directly as an <audio> src.
// - Deleting a memory (release, or user "🗑 Delete") wipes the recording.
//
// This module is intentionally storage-agnostic and framework-free so it
// can be imported by the preview page (writer) and by FarewellScene
// (reader/playback) without pulling any React deps.

import type { EntityKind } from "@/lib/farewell/entities";

const KEY_PREFIX = "lumina-voice:";
const key = (kind: EntityKind, id: string) => `${KEY_PREFIX}${kind}:${id}`;

export type VoiceRecord = {
  dataUrl: string;   // "data:audio/webm;base64,..."
  mime: string;
  duration: number;  // seconds (approx; may be 0 if unknown)
  createdAt: number;
};

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch { /* ignore */ }
  }
  return "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result || ""));
    r.readAsDataURL(blob);
  });
}

export async function saveVoice(
  kind: EntityKind,
  id: string,
  blob: Blob,
  duration: number,
): Promise<VoiceRecord> {
  const dataUrl = await blobToDataUrl(blob);
  const rec: VoiceRecord = {
    dataUrl,
    mime: blob.type || "audio/webm",
    duration: Math.max(0, Math.round(duration * 10) / 10),
    createdAt: Date.now(),
  };
  try {
    localStorage.setItem(key(kind, id), JSON.stringify(rec));
  } catch (err) {
    // Most likely QuotaExceeded — surface a clean error.
    throw new Error("Recording is too long to store locally. Try a shorter one.");
  }
  return rec;
}

export function loadVoice(kind: EntityKind, id: string): VoiceRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(kind, id));
    if (!raw) return null;
    return JSON.parse(raw) as VoiceRecord;
  } catch {
    return null;
  }
}

export function deleteVoice(kind: EntityKind, id: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(key(kind, id)); } catch { /* ignore */ }
}

export function hasVoice(kind: EntityKind, id: string): boolean {
  return loadVoice(kind, id) !== null;
}
