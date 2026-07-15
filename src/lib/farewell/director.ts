// The Ritual Director. A tiny, framework-free timeline / state machine
// that every ritual reuses.
//
// Contract (post-refactor):
//   - The `requestAnimationFrame` loop writes ONLY to refs and fires
//     frame listeners. It NEVER advances beats or calls setState.
//   - React state (`beat`, `beatIndex`, `pastPointOfNoReturn`, `finished`)
//     changes only on beat boundaries and completion.
//   - Every user callback (`onEnter`, `onExit`, `onCommit`, `onFinished`,
//     `onExitEarly`) is invoked from a `queueMicrotask` after the state
//     commit so it never runs during another component's render.
//
// Consumers that need per-frame values should either:
//   (a) subscribe via `director.subscribe(fn)` — fn runs each RAF tick, or
//   (b) read `director.tRef.current` / `elapsedRef.current` inside their
//       own animation loop (R3F `useFrame`, framer-motion
//       `useAnimationFrame`, etc).

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

export type Beat =
  | "arrival"
  | "contemplation"
  | "invitation"
  | "transformation"
  | "stillness"
  | "return";

export type BeatSpec = { name: Beat; duration: number /* ms */ };

// Default cadence. Individual rituals can tune durations but keep names.
export const DEFAULT_BEATS: BeatSpec[] = [
  { name: "arrival",        duration: 2600 },
  { name: "contemplation",  duration: 6500 },
  { name: "invitation",     duration: 999_999 }, // waits for user tap
  { name: "transformation", duration: 32_000 },
  { name: "stillness",      duration: 8000 },
  { name: "return",         duration: 5000 },
];

const POINT_OF_NO_RETURN_INDEX = 3; // start of `transformation`

export type FrameListener = (t: number, elapsed: number, beat: Beat) => void;

export type DirectorState = {
  beat: Beat;
  beatIndex: number;
  pastPointOfNoReturn: boolean;
  finished: boolean;
};

export type DirectorApi = DirectorState & {
  /** Progress within the current beat, 0..1. Updated every RAF frame. */
  tRef: MutableRefObject<number>;
  /** Total elapsed ms since start (excludes pauses). Updated every RAF frame. */
  elapsedRef: MutableRefObject<number>;
  /** Subscribe to per-frame updates. Returns an unsubscribe function. */
  subscribe: (fn: FrameListener) => () => void;
  proceed: () => void;               // advances from `invitation` -> `transformation`
  skip: () => void;                  // jumps to `stillness`
  exit: () => void;                  // aborts (only valid before point of no return)
  restart: () => void;
};

export function useDirector(opts: {
  beats?: BeatSpec[];
  onEnter?: (beat: Beat) => void;
  onExitBeat?: (beat: Beat) => void;
  onFinished?: () => void;
  onExitEarly?: () => void;
  onCommit?: () => void;             // fires when point-of-no-return is crossed
} = {}): DirectorApi {
  const beats = opts.beats ?? DEFAULT_BEATS;
  const beatsRef = useRef(beats);
  beatsRef.current = beats;

  const [state, setState] = useState<DirectorState>({
    beat: beats[0].name,
    beatIndex: 0,
    pastPointOfNoReturn: false,
    finished: false,
  });

  // Frame-mutable refs — never trigger renders.
  const tRef = useRef(0);
  const elapsedRef = useRef(0);
  const beatIndexRef = useRef(0);
  const beatRef = useRef<Beat>(beats[0].name);
  const beatStartRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const cancelledRef = useRef(false);
  const waitingRef = useRef(false); // invitation beat waits for `proceed`
  const pastRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef<Set<FrameListener>>(new Set());
  const [runNonce, setRunNonce] = useState(0);

  // Latest callback handles — refreshed each render so we always call the
  // freshest closures without recreating the RAF loop.
  const cbRef = useRef({
    onEnter: opts.onEnter,
    onExit: opts.onExitBeat,
    onFinished: opts.onFinished,
    onExitEarly: opts.onExitEarly,
    onCommit: opts.onCommit,
  });
  cbRef.current = {
    onEnter: opts.onEnter,
    onExit: opts.onExitBeat,
    onFinished: opts.onFinished,
    onExitEarly: opts.onExitEarly,
    onCommit: opts.onCommit,
  };

  const subscribe = useCallback((fn: FrameListener) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  // Beat transition. Side effects fire in a microtask AFTER setState.
  const advance = useCallback((toIndex: number) => {
    const currentBeats = beatsRef.current;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const prevBeat = beatRef.current;
    const wasPast = pastRef.current;

    // Finished — past the end.
    if (toIndex >= currentBeats.length) {
      cancelledRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setState((prev) => ({ ...prev, finished: true }));
      queueMicrotask(() => {
        cbRef.current.onExit?.(prevBeat);
        cbRef.current.onFinished?.();
      });
      return;
    }

    const nextSpec = currentBeats[toIndex];
    // Sync refs BEFORE state update so listeners fired on the very next tick
    // see the new beat / t=0.
    beatIndexRef.current = toIndex;
    beatRef.current = nextSpec.name;
    beatStartRef.current = performance.now();
    tRef.current = 0;
    const waitsForUser = nextSpec.name === "invitation";
    waitingRef.current = waitsForUser;
    const nowPast = wasPast || toIndex >= POINT_OF_NO_RETURN_INDEX;
    pastRef.current = nowPast;

    setState((prev) => {
      if (
        prev.beat === nextSpec.name &&
        prev.beatIndex === toIndex &&
        prev.pastPointOfNoReturn === nowPast &&
        !prev.finished
      ) {
        return prev;
      }
      return {
        beat: nextSpec.name,
        beatIndex: toIndex,
        pastPointOfNoReturn: nowPast,
        finished: false,
      };
    });

    queueMicrotask(() => {
      cbRef.current.onExit?.(prevBeat);
      cbRef.current.onEnter?.(nextSpec.name);
      if (toIndex === POINT_OF_NO_RETURN_INDEX && !wasPast) {
        cbRef.current.onCommit?.();
      }
    });

    // Beat progression is timer-driven, not RAF-driven. This prevents the
    // animation frame loop from ever becoming a source of React updates.
    if (!waitsForUser) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (cancelledRef.current || beatIndexRef.current !== toIndex) return;
        advance(toIndex + 1);
      }, nextSpec.duration);
    }
  }, []);

  // RAF loop — writes refs, fires listeners, never advances beats or setState.
  useEffect(() => {
    cancelledRef.current = false;
    const currentBeats = beatsRef.current;
    beatIndexRef.current = 0;
    beatRef.current = currentBeats[0].name;
    beatStartRef.current = performance.now();
    lastTickRef.current = beatStartRef.current;
    tRef.current = 0;
    elapsedRef.current = 0;
    waitingRef.current = currentBeats[0].name === "invitation";
    pastRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Fire initial onEnter outside of any render or updater.
    queueMicrotask(() => { cbRef.current.onEnter?.(currentBeats[0].name); });

    if (!waitingRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (cancelledRef.current || beatIndexRef.current !== 0) return;
        advance(1);
      }, currentBeats[0].duration);
    }

    const tick = () => {
      if (cancelledRef.current) return;
      const now = performance.now();
      const activeBeats = beatsRef.current;
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      const idx = beatIndexRef.current;
      const spec = activeBeats[idx] ?? activeBeats[activeBeats.length - 1];
      const beatDt = now - beatStartRef.current;
      const t = Math.min(1, beatDt / spec.duration);

      // Ref writes only — no React state.
      tRef.current = t;
      elapsedRef.current += dt;

      // Fan out to subscribers. Each subscriber is responsible for its own
      // frame-level side effects (motion values, audio param sets, etc).
      const currentBeat = beatRef.current;
      const listeners = listenersRef.current;
      if (listeners.size > 0) {
        listeners.forEach((fn) => {
          try { fn(t, elapsedRef.current, currentBeat); } catch (err) {
            if (import.meta.env.DEV) console.error("[Director] listener threw", err);
          }
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelledRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [advance, runNonce]);

  const proceed = useCallback(() => {
    if (!waitingRef.current) return;
    waitingRef.current = false;
    advance(POINT_OF_NO_RETURN_INDEX);
  }, [advance]);

  const skip = useCallback(() => {
    // Jump straight to stillness. If skipped before crossing the point of
    // no return, we must still commit — always as a microtask side effect.
    const needsCommit = !pastRef.current;
    waitingRef.current = false;
    if (needsCommit) queueMicrotask(() => { cbRef.current.onCommit?.(); });
    advance(4); // stillness
  }, [advance]);

  const exit = useCallback(() => {
    cancelledRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    queueMicrotask(() => { cbRef.current.onExitEarly?.(); });
  }, []);

  const restart = useCallback(() => {
    const currentBeats = beatsRef.current;
    cancelledRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setState({
      beat: currentBeats[0].name,
      beatIndex: 0,
      pastPointOfNoReturn: false,
      finished: false,
    });
    // Kick the effect to re-run and boot a fresh RAF loop.
    setRunNonce((n) => n + 1);
  }, []);

  return {
    ...state,
    tRef,
    elapsedRef,
    subscribe,
    proceed,
    skip,
    exit,
    restart,
  };
}

/** eased 0..1 interpolant */
export const easeInOutCubic = (x: number) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInCubic = (x: number) => x * x * x;
