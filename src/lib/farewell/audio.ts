// Web Audio graph for the Fire ritual. Everything is synthesized — no
// external assets. Layers: room bed, wind, crackle, ember hiss, plus a
// transient ignition strike triggered when the flame first lights.
//
// AudioContext is created lazily and resumed on demand. If the browser
// blocks the initial resume (autoplay policy), we retry on the next user
// gesture via one-shot listeners.

const DBG = typeof import.meta !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV;
const log = (...args: unknown[]) => { if (DBG) console.debug("[farewell/audio]", ...args); };


let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let running: FireAudio | null = null;
let unlockAttached = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) { log("no AudioContext constructor"); return null; }
    try { ctx = new AC(); } catch (e) { log("ctx create failed", e); return null; }
    master = ctx.createGain();
    master.gain.value = 1.0;
    master.connect(ctx.destination);
    log("ctx created", { state: ctx.state, sampleRate: ctx.sampleRate });
  }
  return ctx;
}

function attachUnlock() {
  if (unlockAttached || typeof window === "undefined") return;
  unlockAttached = true;
  const unlock = () => {
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(() => log("unlock: resumed", ctx?.state)).catch((e) => log("unlock resume failed", e));
    }
  };
  const opts = { capture: true, passive: true } as AddEventListenerOptions;
  window.addEventListener("pointerdown", unlock, opts);
  window.addEventListener("touchstart", unlock, opts);
  window.addEventListener("keydown", unlock, opts);
  window.addEventListener("click", unlock, opts);
}


function brownNoiseBuffer(c: AudioContext, seconds = 2): AudioBuffer {
  const len = c.sampleRate * seconds;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

function whiteNoiseBuffer(c: AudioContext, seconds = 2): AudioBuffer {
  const len = c.sampleRate * seconds;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export type FireAudio = {
  setIntensity: (v: number) => void;
  setMuted: (m: boolean) => void;
  ignite: () => void;                 // one-shot ignition transient
  strike: () => void;                 // match strike + tiny crackle (pre-ignite)
  resume: () => Promise<void>;        // explicit resume for CTA gestures
  fadeOut: (ms?: number) => Promise<void>;
  dispose: () => void;
};

export async function startFireAudio(): Promise<FireAudio | null> {
  log("startFireAudio()");
  const c = ensureCtx();
  if (!c || !master) { log("no ctx/master, aborting"); return null; }
  attachUnlock();
  if (c.state === "suspended") {
    try { await c.resume(); log("initial resume ok", c.state); }
    catch (e) { log("initial resume blocked (will unlock on gesture)", e); }
  }
  if (running) { log("reusing running audio graph"); return running; }
  log("building audio graph", { ctxState: c.state, masterGain: master.gain.value });

  const now = c.currentTime;


  /* --- Room bed: soft, low-pass brown noise (barely audible ambience) --- */
  const bed = c.createBufferSource();
  bed.buffer = brownNoiseBuffer(c, 3);
  bed.loop = true;
  const bedFilter = c.createBiquadFilter();
  bedFilter.type = "lowpass";
  bedFilter.frequency.value = 260;
  const bedGain = c.createGain();
  bedGain.gain.value = 0.0;
  bed.connect(bedFilter).connect(bedGain).connect(master);
  bed.start();
  bedGain.gain.linearRampToValueAtTime(0.28, now + 2.0);

  /* --- Wind: very low-pass noise with slow LFO ------------------------- */
  const wind = c.createBufferSource();
  wind.buffer = brownNoiseBuffer(c, 4);
  wind.loop = true;
  const windLP = c.createBiquadFilter();
  windLP.type = "lowpass";
  windLP.frequency.value = 380;
  const windGain = c.createGain();
  windGain.gain.value = 0.0;
  wind.connect(windLP).connect(windGain).connect(master);
  wind.start();
  // Slow amplitude LFO for gentle gusts
  const windLfo = c.createOscillator();
  const windLfoGain = c.createGain();
  windLfo.frequency.value = 0.11;
  windLfoGain.gain.value = 0.14;
  windLfo.connect(windLfoGain).connect(windGain.gain);
  windLfo.start();

  /* --- Crackle: bandpassed dense noise, gain driven by intensity ------- */
  const crackle = c.createBufferSource();
  crackle.buffer = brownNoiseBuffer(c, 2);
  crackle.loop = true;
  const crackleBP = c.createBiquadFilter();
  crackleBP.type = "bandpass";
  crackleBP.frequency.value = 1800;
  crackleBP.Q.value = 0.7;
  const crackleGain = c.createGain();
  crackleGain.gain.value = 0.0;
  crackle.connect(crackleBP).connect(crackleGain).connect(master);
  crackle.start();

  /* --- Paper texture: mid-band whispery burn sound --------------------- */
  const paperBed = c.createBufferSource();
  paperBed.buffer = whiteNoiseBuffer(c, 2);
  paperBed.loop = true;
  const paperBP = c.createBiquadFilter();
  paperBP.type = "bandpass";
  paperBP.frequency.value = 900;
  paperBP.Q.value = 0.8;
  const paperGain = c.createGain();
  paperGain.gain.value = 0.0;
  paperBed.connect(paperBP).connect(paperGain).connect(master);
  paperBed.start();

  /* --- Ember hiss: high-pass shimmer ----------------------------------- */
  const hiss = c.createBufferSource();
  hiss.buffer = whiteNoiseBuffer(c, 2);
  hiss.loop = true;
  const hissHP = c.createBiquadFilter();
  hissHP.type = "highpass";
  hissHP.frequency.value = 3800;
  const hissGain = c.createGain();
  hissGain.gain.value = 0.0;
  hiss.connect(hissHP).connect(hissGain).connect(master);
  hiss.start();

  let currentIntensity = 0;
  let muted = false;

  // Occasional low pops on the crackle bus, scaled by intensity.
  const popTimer = window.setInterval(() => {
    if (!master || !ctx || currentIntensity < 0.04) return;
    const t = ctx.currentTime;
    crackleGain.gain.cancelScheduledValues(t);
    const base = 0.05 + currentIntensity * 0.38;
    crackleGain.gain.setValueAtTime(base, t);
    crackleGain.gain.linearRampToValueAtTime(base + 0.45 * currentIntensity, t + 0.02);
    crackleGain.gain.exponentialRampToValueAtTime(Math.max(0.002, base * 0.4), t + 0.35);
  }, 170);

  const api: FireAudio = {
    setIntensity(v) {
      currentIntensity = Math.max(0, Math.min(1, v));
      if (!c || muted) return;
      const t = c.currentTime;
      hissGain.gain.linearRampToValueAtTime(0.02 + 0.20 * currentIntensity, t + 0.15);
      paperGain.gain.linearRampToValueAtTime(0.05 + 0.28 * currentIntensity, t + 0.20);
      windGain.gain.linearRampToValueAtTime(0.10 + 0.18 * currentIntensity, t + 0.30);
      bedFilter.frequency.linearRampToValueAtTime(240 + 320 * currentIntensity, t + 0.3);
      bedGain.gain.linearRampToValueAtTime(0.28 + 0.20 * currentIntensity, t + 0.25);
    },
    async resume() {
      if (!c) return;
      log("resume() called", { state: c.state });
      if (c.state === "suspended") {
        try { await c.resume(); log("resume() ok", c.state); }
        catch (e) { log("resume() failed", e); }
      }
    },
    setMuted(m) {
      muted = m;
      if (!master || !c) return;
      const t = c.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.linearRampToValueAtTime(m ? 0 : 1.0, t + 0.25);
    },
    ignite() {
      // Tiny "whoosh + tick": short filtered noise burst → quick decay.
      if (!c || !master) return;
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = whiteNoiseBuffer(c, 0.6);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(600, t);
      bp.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
      bp.Q.value = 1.4;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.55, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.6);
      // Small low tick under the whoosh
      const tick = c.createOscillator();
      const tickG = c.createGain();
      tick.type = "sine";
      tick.frequency.setValueAtTime(90, t);
      tick.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      tickG.gain.setValueAtTime(0.0, t);
      tickG.gain.linearRampToValueAtTime(0.28, t + 0.02);
      tickG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      tick.connect(tickG).connect(master);
      tick.start(t);
      tick.stop(t + 0.35);
    },
    strike() {
      // Short scratchy strike + tiny crackle — quieter than ignite().
      if (!c || !master) return;
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = whiteNoiseBuffer(c, 0.35);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(2600, t);
      bp.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
      bp.Q.value = 2.2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.35);
    },
    async fadeOut(ms = 1500) {
      if (!c || !master) return;
      const t = c.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.linearRampToValueAtTime(0, t + ms / 1000);
      await new Promise((r) => setTimeout(r, ms));
    },
    dispose() {
      log("dispose()", { ctxState: c?.state });
      try { bed.stop(); wind.stop(); windLfo.stop(); crackle.stop(); paperBed.stop(); hiss.stop(); } catch {}
      [bed, bedFilter, bedGain, wind, windLP, windGain, windLfo, windLfoGain,
       crackle, crackleBP, crackleGain, paperBed, paperBP, paperGain,
       hiss, hissHP, hissGain]
        .forEach((n) => { try { n.disconnect(); } catch {} });
      window.clearInterval(popTimer);
      running = null;
    },
  };
  log("audio graph built and running");
  running = api;
  return api;
}

export function stopAllAudio() {
  running?.dispose();
  running = null;
}
