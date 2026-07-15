// Voice transport helpers — mutation of the ritual HTMLAudioElement
// happens ONLY through these helpers, and they must be invoked ONLY by
// FarewellScene (the sole owner). Every other component talks through
// the VoiceController callbacks defined below.

export type VoiceController = {
  requestPlay: () => void;
  requestPause: () => void;
  requestSeek: (time: number) => void;
  requestReplay: () => void;
  isLocked: () => boolean;
};

function clampVol(v: number) {
  if (!isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function softPlay(a: HTMLAudioElement, target = 0.9, ms = 420) {
  a.loop = false;
  a.volume = 0;
  const start = performance.now();
  a.play().catch(() => { /* autoplay/interaction errors are surfaced via the audio "error" event */ });
  const step = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / ms));
    a.volume = clampVol(t * target);
    if (t < 1 && !a.paused) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function softPause(a: HTMLAudioElement, ms = 420) {
  const from = clampVol(a.volume);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / ms));
    a.volume = clampVol(from * (1 - t));
    if (t < 1) requestAnimationFrame(step);
    else { try { a.pause(); } catch { /* ignore */ } }
  };
  requestAnimationFrame(step);
}
