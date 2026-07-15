// Writing Atmosphere — Web Audio ambient engine.
//
// Everything is synthesized (no external samples) so the editor stays fast
// and offline-friendly. Each ambience is a factory that builds a subgraph
// under a per-ambience GainNode which we can fade in/out for crossfades.
//
// Public surface: useAmbient() React hook + tiny imperative API.

import { useSyncExternalStore } from "react";

export type AmbientKind =
  | "off"
  | "rain"
  | "cafe"
  | "forest"
  | "ocean"
  | "fire"
  | "library"
  | "night"
  | "piano";

export type AmbientMeta = {
  key: AmbientKind;
  label: string;
  emoji: string;
  description: string;
};

export const AMBIENTS: AmbientMeta[] = [
  { key: "rain",    label: "Rain",       emoji: "🌧",  description: "Soft rain, distant thunder" },
  { key: "cafe",    label: "Cozy Café",  emoji: "☕", description: "Warm café ambience" },
  { key: "forest",  label: "Forest",     emoji: "🌲", description: "Birds, wind, leaves" },
  { key: "ocean",   label: "Ocean",      emoji: "🌊", description: "Slow waves, seagulls" },
  { key: "fire",    label: "Fireplace",  emoji: "🔥", description: "Crackling cabin fire" },
  { key: "library", label: "Library",    emoji: "📚", description: "Quiet pages turning" },
  { key: "night",   label: "Night",      emoji: "🌙", description: "Crickets, soft breeze" },
  { key: "piano",   label: "Piano",      emoji: "🎹", description: "Gentle instrumental" },
];

/* ------------------------------------------------------------------ *
 * State + subscription (useSyncExternalStore)
 * ------------------------------------------------------------------ */

type State = { kind: AmbientKind; volume: number; playing: boolean };

const LS_KIND = "lumina.ambient.kind";
const LS_VOL = "lumina.ambient.volume";

const initialState = (): State => {
  if (typeof window === "undefined") return { kind: "off", volume: 0.5, playing: false };
  const rawKind = window.localStorage.getItem(LS_KIND) as AmbientKind | null;
  const rawVol = window.localStorage.getItem(LS_VOL);
  const kind = rawKind && AMBIENTS.some((a) => a.key === rawKind) ? rawKind : "off";
  const volume = rawVol ? Math.max(0, Math.min(1, parseFloat(rawVol))) : 0.5;
  return { kind, volume, playing: false };
};

let state: State = initialState();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const getSnapshot = () => state;
const getServerSnapshot = () => ({ kind: "off" as AmbientKind, volume: 0.5, playing: false });

/* ------------------------------------------------------------------ *
 * Audio graph
 * ------------------------------------------------------------------ */

const CROSSFADE_MS = 600;

type Layer = { gain: GainNode; dispose: () => void };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let current: { kind: AmbientKind; layer: Layer } | null = null;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = state.volume;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** shared 2s white-noise buffer, generated lazily */
let noise2s: AudioBuffer | null = null;
function whiteNoise(c: AudioContext): AudioBuffer {
  if (noise2s && noise2s.sampleRate === c.sampleRate) return noise2s;
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noise2s = buf;
  return buf;
}

/** brown noise (low-freq weighted) — smoother than white for wind/fire beds */
function brownNoise(c: AudioContext): AudioBuffer {
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

/* ---------- ambience builders ---------- */

function makeLayer(c: AudioContext): Layer {
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(master!);
  const cleanups: Array<() => void> = [];
  return {
    gain,
    dispose: () => {
      cleanups.forEach((fn) => { try { fn(); } catch {} });
      try { gain.disconnect(); } catch {}
    },
  };
}

function attachSource(
  layer: Layer,
  src: AudioScheduledSourceNode,
  cleanups: Array<() => void>,
) {
  cleanups.push(() => { try { src.stop(); } catch {} try { (src as AudioNode).disconnect(); } catch {} });
}

/** helper: schedule a repeating callback until layer is disposed */
function every(min: number, max: number, cb: () => void, cleanups: Array<() => void>) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    cb();
    const next = min + Math.random() * (max - min);
    const id = window.setTimeout(tick, next * 1000);
    cleanups.push(() => window.clearTimeout(id));
  };
  const id0 = window.setTimeout(tick, (min * 0.5 + Math.random() * min) * 1000);
  cleanups.push(() => { stopped = true; window.clearTimeout(id0); });
}

function build(kind: AmbientKind, c: AudioContext): Layer | null {
  if (kind === "off") return null;
  const layer = makeLayer(c);
  const cleanups: Array<() => void> = [];
  // patch dispose to include our locals
  const baseDispose = layer.dispose;
  layer.dispose = () => { cleanups.forEach((fn) => { try { fn(); } catch {} }); baseDispose(); };

  const now = c.currentTime;

  // ── RAIN ────────────────────────────────────────────────
  if (kind === "rain") {
    const src = c.createBufferSource();
    src.buffer = whiteNoise(c);
    src.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 900;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 6000;
    const g = c.createGain(); g.gain.value = 0.55;
    src.connect(hp).connect(lp).connect(g).connect(layer.gain);
    src.start();
    attachSource(layer, src, cleanups);

    // distant thunder — rare, subtle
    every(45, 90, () => {
      const t = c.currentTime;
      const noise = c.createBufferSource();
      noise.buffer = brownNoise(c);
      const f = c.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 180;
      const tg = c.createGain();
      tg.gain.setValueAtTime(0, t);
      tg.gain.linearRampToValueAtTime(0.35, t + 0.8);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
      noise.connect(f).connect(tg).connect(layer.gain);
      noise.start(t);
      noise.stop(t + 5);
    }, cleanups);
  }

  // ── CAFÉ ────────────────────────────────────────────────
  else if (kind === "cafe") {
    // low murmur bed
    const src = c.createBufferSource();
    src.buffer = brownNoise(c);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 700;
    const g = c.createGain(); g.gain.value = 0.7;
    src.connect(lp).connect(g).connect(layer.gain);
    src.start();
    attachSource(layer, src, cleanups);

    // tiny warm hum on top for room tone
    const hum = c.createBufferSource();
    hum.buffer = whiteNoise(c);
    hum.loop = true;
    const hf = c.createBiquadFilter();
    hf.type = "bandpass"; hf.frequency.value = 500; hf.Q.value = 0.7;
    const hg = c.createGain(); hg.gain.value = 0.08;
    hum.connect(hf).connect(hg).connect(layer.gain);
    hum.start();
    attachSource(layer, hum, cleanups);

    // occasional cup clink
    every(6, 14, () => {
      const t = c.currentTime;
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 1400 + Math.random() * 800;
      const eg = c.createGain();
      eg.gain.setValueAtTime(0, t);
      eg.gain.linearRampToValueAtTime(0.08, t + 0.005);
      eg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(eg).connect(layer.gain);
      osc.start(t); osc.stop(t + 0.3);
    }, cleanups);
  }

  // ── FOREST ─────────────────────────────────────────────
  else if (kind === "forest") {
    // wind bed
    const wind = c.createBufferSource();
    wind.buffer = brownNoise(c);
    wind.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = "lowpass"; wf.frequency.value = 500;
    const wg = c.createGain(); wg.gain.value = 0.5;
    // slow LFO on gain for gusts
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = 0.12; lfoG.gain.value = 0.3;
    lfo.connect(lfoG).connect(wg.gain);
    lfo.start();
    wind.connect(wf).connect(wg).connect(layer.gain);
    wind.start();
    attachSource(layer, wind, cleanups);
    attachSource(layer, lfo, cleanups);

    // leaf rustle — hp noise pulses
    every(5, 11, () => {
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = whiteNoise(c);
      const f = c.createBiquadFilter();
      f.type = "highpass"; f.frequency.value = 3000;
      const eg = c.createGain();
      eg.gain.setValueAtTime(0, t);
      eg.gain.linearRampToValueAtTime(0.12, t + 0.15);
      eg.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      src.connect(f).connect(eg).connect(layer.gain);
      src.start(t); src.stop(t + 1.3);
    }, cleanups);

    // occasional bird chirp
    every(4, 9, () => {
      const t = c.currentTime;
      const osc = c.createOscillator();
      osc.type = "sine";
      const base = 1800 + Math.random() * 1400;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.08);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.18);
      const eg = c.createGain();
      eg.gain.setValueAtTime(0, t);
      eg.gain.linearRampToValueAtTime(0.08, t + 0.02);
      eg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(eg).connect(layer.gain);
      osc.start(t); osc.stop(t + 0.3);
    }, cleanups);
  }

  // ── OCEAN ──────────────────────────────────────────────
  else if (kind === "ocean") {
    const src = c.createBufferSource();
    src.buffer = whiteNoise(c);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 450;
    const g = c.createGain(); g.gain.value = 0.6;
    // slow LFO — wave swell
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = 0.14; lfoG.gain.value = 0.4;
    lfo.connect(lfoG).connect(g.gain);
    lfo.start();
    src.connect(lp).connect(g).connect(layer.gain);
    src.start();
    attachSource(layer, src, cleanups);
    attachSource(layer, lfo, cleanups);

    // occasional seagull
    every(18, 40, () => {
      const t = c.currentTime;
      const osc = c.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
      osc.frequency.exponentialRampToValueAtTime(700, t + 0.28);
      const eg = c.createGain();
      eg.gain.setValueAtTime(0, t);
      eg.gain.linearRampToValueAtTime(0.06, t + 0.03);
      eg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(eg).connect(layer.gain);
      osc.start(t); osc.stop(t + 0.4);
    }, cleanups);
  }

  // ── FIREPLACE ──────────────────────────────────────────
  else if (kind === "fire") {
    const src = c.createBufferSource();
    src.buffer = brownNoise(c);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 300;
    const g = c.createGain(); g.gain.value = 0.55;
    src.connect(lp).connect(g).connect(layer.gain);
    src.start();
    attachSource(layer, src, cleanups);

    // crackles — dense short high-freq pops
    every(0.15, 0.7, () => {
      const t = c.currentTime;
      const n = c.createBufferSource();
      n.buffer = whiteNoise(c);
      const f = c.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 2500 + Math.random() * 3000; f.Q.value = 2;
      const eg = c.createGain();
      const amp = 0.05 + Math.random() * 0.12;
      eg.gain.setValueAtTime(0, t);
      eg.gain.linearRampToValueAtTime(amp, t + 0.003);
      eg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      n.connect(f).connect(eg).connect(layer.gain);
      n.start(t); n.stop(t + 0.1);
    }, cleanups);
  }

  // ── LIBRARY ────────────────────────────────────────────
  else if (kind === "library") {
    // very quiet room tone
    const src = c.createBufferSource();
    src.buffer = brownNoise(c);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 250;
    const g = c.createGain(); g.gain.value = 0.32;
    src.connect(lp).connect(g).connect(layer.gain);
    src.start();
    attachSource(layer, src, cleanups);

    // page turn
    every(8, 20, () => {
      const t = c.currentTime;
      const n = c.createBufferSource();
      n.buffer = whiteNoise(c);
      const f = c.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 3800; f.Q.value = 1.2;
      const eg = c.createGain();
      eg.gain.setValueAtTime(0, t);
      eg.gain.linearRampToValueAtTime(0.12, t + 0.04);
      eg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      n.connect(f).connect(eg).connect(layer.gain);
      n.start(t); n.stop(t + 0.4);
    }, cleanups);
  }

  // ── NIGHT ──────────────────────────────────────────────
  else if (kind === "night") {
    // low breeze bed
    const wind = c.createBufferSource();
    wind.buffer = brownNoise(c);
    wind.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = "lowpass"; wf.frequency.value = 350;
    const wg = c.createGain(); wg.gain.value = 0.32;
    wind.connect(wf).connect(wg).connect(layer.gain);
    wind.start();
    attachSource(layer, wind, cleanups);

    // cricket chorus — modulated bandpass on noise
    const crick = c.createBufferSource();
    crick.buffer = whiteNoise(c);
    crick.loop = true;
    const cf = c.createBiquadFilter();
    cf.type = "bandpass"; cf.frequency.value = 4500; cf.Q.value = 25;
    const cg = c.createGain(); cg.gain.value = 0;
    // pulse LFO ~6Hz shaped to on/off
    const lfo = c.createOscillator();
    lfo.type = "square"; lfo.frequency.value = 6;
    const lfoG = c.createGain(); lfoG.gain.value = 0.14;
    lfo.connect(lfoG).connect(cg.gain);
    lfo.start();
    crick.connect(cf).connect(cg).connect(layer.gain);
    crick.start();
    attachSource(layer, crick, cleanups);
    attachSource(layer, lfo, cleanups);
  }

  // ── PIANO ──────────────────────────────────────────────
  else if (kind === "piano") {
    // C major pentatonic, gentle random arpeggios
    const notes = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
    const pianoG = c.createGain();
    pianoG.gain.value = 0.6;
    pianoG.connect(layer.gain);

    // soft low pad bed
    const pad = c.createBufferSource();
    pad.buffer = brownNoise(c);
    pad.loop = true;
    const pf = c.createBiquadFilter();
    pf.type = "lowpass"; pf.frequency.value = 240;
    const pg = c.createGain(); pg.gain.value = 0.25;
    pad.connect(pf).connect(pg).connect(layer.gain);
    pad.start();
    attachSource(layer, pad, cleanups);

    let stopped = false;
    cleanups.push(() => { stopped = true; });
    const playNote = () => {
      if (stopped) return;
      const t = c.currentTime;
      const f = notes[Math.floor(Math.random() * notes.length)];
      // triangle+sine mix approximates a soft piano-ish tone
      const o1 = c.createOscillator(); o1.type = "triangle"; o1.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = "sine";     o2.frequency.value = f * 2;
      const eg = c.createGain();
      const amp = 0.22;
      eg.gain.setValueAtTime(0, t);
      eg.gain.linearRampToValueAtTime(amp, t + 0.02);
      eg.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      const mix = c.createGain(); mix.gain.value = 0.5;
      o1.connect(mix); o2.connect(mix);
      mix.connect(eg).connect(pianoG);
      o1.start(t); o2.start(t);
      o1.stop(t + 2); o2.stop(t + 2);
      const next = 900 + Math.random() * 1500;
      const id = window.setTimeout(playNote, next);
      cleanups.push(() => window.clearTimeout(id));
    };
    const id0 = window.setTimeout(playNote, 400);
    cleanups.push(() => window.clearTimeout(id0));
  }

  // silence any un-set gain: fade-in handled by caller
  return layer;
  void now;
}

/* ------------------------------------------------------------------ *
 * Transport (crossfade / persistence)
 * ------------------------------------------------------------------ */

async function crossfadeTo(kind: AmbientKind) {
  const c = ensure();
  if (!c || !master) return;
  if (c.state === "suspended") await c.resume();
  const fadeS = CROSSFADE_MS / 1000;
  const now = c.currentTime;

  const prev = current;
  if (prev) {
    prev.layer.gain.gain.cancelScheduledValues(now);
    prev.layer.gain.gain.setValueAtTime(prev.layer.gain.gain.value, now);
    prev.layer.gain.gain.linearRampToValueAtTime(0, now + fadeS);
    const disposeAt = window.setTimeout(() => prev.layer.dispose(), CROSSFADE_MS + 100);
    void disposeAt;
  }

  if (kind === "off") {
    current = null;
    return;
  }

  const layer = build(kind, c);
  if (!layer) return;
  layer.gain.gain.setValueAtTime(0, now);
  layer.gain.gain.linearRampToValueAtTime(1, now + fadeS);
  current = { kind, layer };
}

function persistKind(kind: AmbientKind) {
  try { window.localStorage.setItem(LS_KIND, kind); } catch {}
}
function persistVolume(v: number) {
  try { window.localStorage.setItem(LS_VOL, String(v)); } catch {}
}

export async function playAmbient(kind: AmbientKind) {
  state = { ...state, kind, playing: kind !== "off" };
  persistKind(kind);
  emit();
  await crossfadeTo(kind);
}

export async function pauseAmbient() {
  const c = ensure();
  if (!c || !master) return;
  // simply mute master; keep graph so resume is instant
  const now = c.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0, now + 0.2);
  state = { ...state, playing: false };
  emit();
}

export async function resumeAmbient() {
  const c = ensure();
  if (!c || !master) return;
  if (c.state === "suspended") await c.resume();
  if (state.kind === "off") return;
  if (!current) { await crossfadeTo(state.kind); }
  const now = c.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(state.volume, now + 0.25);
  state = { ...state, playing: true };
  emit();
}

export function setAmbientVolume(v: number) {
  const clamped = Math.max(0, Math.min(1, v));
  state = { ...state, volume: clamped };
  persistVolume(clamped);
  emit();
  ensure();
  if (master) {
    const now = ctx!.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(state.playing ? clamped : 0, now + 0.15);
  }
}

/* ------------------------------------------------------------------ *
 * React hook
 * ------------------------------------------------------------------ */

export function useAmbient() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    kind: s.kind,
    volume: s.volume,
    playing: s.playing,
    select: (k: AmbientKind) => playAmbient(k),
    stop: () => playAmbient("off"),
    pause: pauseAmbient,
    resume: resumeAmbient,
    setVolume: setAmbientVolume,
  };
}

/* ------------------------------------------------------------------ *
 * Back-compat exports for old FocusMode
 * ------------------------------------------------------------------ */

export type Ambient = AmbientKind;
export function getCurrentAmbient(): AmbientKind {
  return state.kind;
}
