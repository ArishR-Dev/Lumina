// Tiny wrapper around navigator.vibrate. All calls are no-ops on
// non-supporting devices or when disabled.

export type HapticCue = "ignite" | "commit" | "settle" | "end";

let enabled = true;

export function setHapticsEnabled(v: boolean) { enabled = v; }
export function hapticsEnabled() { return enabled; }

export function haptic(cue: HapticCue) {
  if (!enabled) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    switch (cue) {
      case "ignite": navigator.vibrate([12, 40, 22]); break;
      case "commit": navigator.vibrate(30); break;
      case "settle": navigator.vibrate([8, 60, 8]); break;
      case "end":    navigator.vibrate(6); break;
    }
  } catch { /* ignore */ }
}
