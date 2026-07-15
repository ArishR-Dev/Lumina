// MatchFireOverlay — mounts the supplied MatchFire animation over the
// Farewell scene and layers cinematic polish AROUND it. The MatchFire
// module itself is never touched; every extra flourish (warm flash,
// ambient glow, tip ember, ash flakes, afterglow) is built as sibling
// DOM in this overlay and driven purely from the untouched `onStart`,
// `onProgress`, and `onComplete` callbacks.
//
// Flow now emitted upward:
//   burnLetter.onStart      → warm light flash at strike point
//   burnLetter.onProgress   → move ambient glow, tip ember, drop ash flakes
//   burnLetter.onComplete   → 120ms delayed onComplete (paper burn delay)
//                             + afterglow ember that dims / falls / fades
// The parent decides when to unmount us; we keep the afterglow visible
// until it does.

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { burnLetter, type BurnLetterOptions } from "@/lib/farewell/matchfire";
import "@/components/farewell/matchfire.css";

export type MatchFireOverlayProps = {
  active: boolean;
  edge?: BurnLetterOptions["edge"];
  duration?: number;
  holdBefore?: number;
  /** Delay between MatchFire finishing and firing onComplete (paper ignite). */
  burnDelay?: number;
  /** Rendered paper element. When provided, the match travel rectangle is
   *  sized on mobile to the paper's live bounding box (with a small outset)
   *  so the match starts / ends just outside the paper edges regardless of
   *  the paper's rendered size. Desktop keeps the default fixed rectangle. */
  paperElRef?: MutableRefObject<HTMLElement | null>;
  onStart?: () => void;
  onProgress?: BurnLetterOptions["onProgress"];
  /** Fires whenever the flame tip position translates to a paper-uv
   *  coordinate (u∈[0,1] across the paper edge, v∈[0,1] up the paper).
   *  The FireScene reads this so the burn shader's ignition point
   *  starts exactly where the match flame touched. */
  onBurnUv?: (uv: { u: number; v: number }) => void;
  onComplete: () => void;
};

type Flake = { id: number; x: number; y: number; vx: number; vy: number };

export function MatchFireOverlay({
  active,
  edge = "bottom",
  duration = 2000,
  holdBefore,
  burnDelay = 120,
  paperElRef,
  onStart,
  onProgress,
  onBurnUv,
  onComplete,
}: MatchFireOverlayProps) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const emberRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const afterglowRef = useRef<HTMLDivElement | null>(null);
  const flakeLayerRef = useRef<HTMLDivElement | null>(null);
  const heatRef = useRef<HTMLDivElement | null>(null);
  const burnGlowRef = useRef<HTMLDivElement | null>(null);
  const smokeLayerRef = useRef<HTMLDivElement | null>(null);
  const sparkLayerRef = useRef<HTMLDivElement | null>(null);

  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const flakeIdRef = useRef(0);
  const lastFlakeAtRef = useRef(0);
  const lastSmokeAtRef = useRef(0);
  const lastSparkAtRef = useRef(0);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const [phase, setPhase] = useState<"idle" | "running" | "afterglow">("idle");

  // Mobile / tablet gate — only these viewports resize the travel rect to
  // the paper's bounding box. Desktop keeps the original fixed rectangle.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  const cbRef = useRef({ onStart, onProgress, onBurnUv, onComplete });
  cbRef.current = { onStart, onProgress, onBurnUv, onComplete };

  // Size the invisible MatchFire target rectangle to the paper's live
  // bounding box (with a small outset) so the match starts / ends just
  // outside the paper edges and its travel distance scales with the
  // paper on EVERY viewport, not just mobile. Runs BEFORE the burnLetter
  // effect below because that effect reads `target.getBoundingClientRect()`
  // once at construction.
  useLayoutEffect(() => {
    if (!active) return;
    const target = targetRef.current;
    if (!target) return;
    if (!paperElRef?.current) return;
    const paper = paperElRef.current;
    const OUTSET = 12; // px — flame appears just outside the paper edge
    const apply = () => {
      const r = paper.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      target.style.left = `${r.left - OUTSET}px`;
      target.style.top = `${r.top - OUTSET}px`;
      target.style.width = `${r.width + OUTSET * 2}px`;
      target.style.height = `${r.height + OUTSET * 2}px`;
      target.style.transform = "none";
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(paper);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, [active, paperElRef]);


  // Convert a page-space flame position to paper-uv within the overlay's
  // invisible target rectangle. The MatchFire tip travels along one of
  // this rect's four edges, so the resulting uv sits exactly on the same
  // paper edge in the shader — never at the center.
  const toPaperUv = (pageX: number, pageY: number) => {
    const target = targetRef.current;
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    const vx = pageX - window.scrollX;
    const vy = pageY - window.scrollY;
    const uRaw = (vx - rect.left) / Math.max(1, rect.width);
    // Paper-uv has v=0 at the BOTTOM of the sheet, y grows downward in
    // screen space, so flip.
    const vRaw = 1 - (vy - rect.top) / Math.max(1, rect.height);
    return {
      u: Math.max(0, Math.min(1, uRaw)),
      v: Math.max(0, Math.min(1, vRaw)),
    };
  };

  // Pause CSS animations across the whole overlay while the tab is
  // hidden — saves battery and prevents queued work piling up.
  useEffect(() => {
    if (!active) return;
    const onVis = () => {
      const root = document.querySelector<HTMLElement>("[data-mf-root]");
      if (!root) return;
      const state = document.hidden ? "paused" : "running";
      root.style.animationPlayState = state;
      root.querySelectorAll<HTMLElement>("*").forEach((n) => {
        n.style.animationPlayState = state;
      });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [active]);

  useEffect(() => {
    if (!active || startedRef.current) return;
    const target = targetRef.current;
    if (!target) return;
    startedRef.current = true;
    setPhase("running");

    // Adaptive match length: the stick spans a fraction of the paper's
    // width so a small card gets a short match and a wide card gets a
    // longer one — never floating far past the paper edges.
    let matchLength: number | undefined;
    const paperEl = paperElRef?.current;
    if (paperEl) {
      const pr = paperEl.getBoundingClientRect();
      if (pr.width > 0) {
        matchLength = Math.max(90, Math.min(230, pr.width * 0.38));
      }
    }

    const match = burnLetter(target, {
      edge,
      duration,
      holdBefore,
      length: matchLength,
      onStart: () => {
        // Warm flash at the strike point (start corner of the edge).
        const rect = target.getBoundingClientRect();
        const startX =
          edge === "right"
            ? rect.right
            : edge === "left" || edge === "top" || edge === "bottom"
            ? rect.left
            : rect.left;
        const startY =
          edge === "top"
            ? rect.top
            : edge === "bottom"
            ? rect.bottom
            : rect.top;
        if (flashRef.current) {
          const f = flashRef.current;
          f.style.left = `${startX}px`;
          f.style.top = `${startY}px`;
          f.classList.remove("mf-flash-run");
          // reflow to restart the animation
          void f.offsetWidth;
          f.classList.add("mf-flash-run");
        }
        // Emit the starting ignition uv so the paper burn origin is
        // pinned to the exact edge point where the match first touched.
        const startUv = toPaperUv(startX + window.scrollX, startY + window.scrollY);
        if (startUv) cbRef.current.onBurnUv?.(startUv);
        cbRef.current.onStart?.();
      },
      onProgress: (p) => {
        const vx = p.x - window.scrollX;
        const vy = p.y - window.scrollY;
        lastPosRef.current = { x: vx, y: vy };

        // Skip DOM writes while the tab is hidden — saves battery and
        // prevents queued rAF frames from piling up until the tab returns.
        const hidden = typeof document !== "undefined" && document.hidden;

        // Follow-the-flame layers use translate3d to force GPU compositing.
        const follow = `translate3d(${vx}px, ${vy}px, 0) translate(-50%, -50%)`;
        const bell = Math.sin(Math.min(1, Math.max(0, p.progress)) * Math.PI);

        if (!hidden) {
          if (glowRef.current) {
            glowRef.current.style.transform = follow;
            glowRef.current.style.opacity = String(0.08 * bell);
          }
          if (emberRef.current) {
            emberRef.current.style.transform = follow;
            emberRef.current.style.opacity = "1";
          }
          if (heatRef.current) {
            heatRef.current.style.transform = follow;
            heatRef.current.style.opacity = "1";
          }
          if (burnGlowRef.current) {
            burnGlowRef.current.style.transform = follow;
            burnGlowRef.current.style.opacity = String(0.55 + 0.35 * bell);
          }

          // Organic spawn intervals — jitter each cadence so particles
          // don't emit on a perfectly repeating clock.
          const now = performance.now();
          if (now - lastFlakeAtRef.current > 80 + Math.random() * 60 && flakeLayerRef.current) {
            lastFlakeAtRef.current = now;
            spawnFlake(flakeLayerRef.current, vx, vy, flakeIdRef.current++);
          }
          if (now - lastSmokeAtRef.current > 110 + Math.random() * 80 && smokeLayerRef.current) {
            lastSmokeAtRef.current = now;
            spawnSmoke(smokeLayerRef.current, vx + (Math.random() - 0.5) * 6, vy - 18);
          }
          if (now - lastSparkAtRef.current > 45 + Math.random() * 45 && sparkLayerRef.current) {
            lastSparkAtRef.current = now;
            spawnSpark(sparkLayerRef.current, vx, vy - 10);
          }
        }

        cbRef.current.onProgress?.(p);
        const uv = toPaperUv(p.x, p.y);
        if (uv) cbRef.current.onBurnUv?.(uv);
      },
      onComplete: () => {
        if (completedRef.current) return;
        completedRef.current = true;

        // Freeze ember + start afterglow (dim → fall → fade).
        if (emberRef.current) emberRef.current.style.opacity = "0";
        if (glowRef.current) glowRef.current.style.opacity = "0";
        if (heatRef.current) heatRef.current.style.opacity = "0";
        if (burnGlowRef.current) burnGlowRef.current.style.opacity = "0";
        if (afterglowRef.current && lastPosRef.current) {
          const { x, y } = lastPosRef.current;
          const a = afterglowRef.current;
          a.style.left = `${x}px`;
          a.style.top = `${y}px`;
          a.classList.remove("mf-afterglow-run");
          void a.offsetWidth;
          a.classList.add("mf-afterglow-run");
        }
        setPhase("afterglow");

        // Small delay so the paper doesn't ignite the same frame the match
        // touches — an "ember settles then catches" pause.
        window.setTimeout(() => {
          cbRef.current.onComplete();
        }, burnDelay);
      },
    });

    return () => {
      try { match.destroy(); } catch { /* noop */ }
    };
  }, [active, edge, duration, holdBefore, burnDelay]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[75]"
      data-mf-root=""
      aria-hidden="true"
    >
      {/* Polish layer stylesheet — kept alongside so we never touch
          matchfire.css (source of truth). */}
      <style>{POLISH_CSS}</style>

      {/* SVG filter for heat-distortion shimmer around the flame. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <filter id="mf-heat-distort" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.014 0.06" numOctaves="2" seed="7">
              <animate attributeName="baseFrequency" dur="3.2s"
                values="0.014 0.06;0.02 0.09;0.014 0.06" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="8" />
          </filter>
        </defs>
      </svg>

      {/* Invisible target rectangle for burnLetter's edge math. */}
      <div
        ref={targetRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(70vw, 560px)",
          height: "min(70vh, 720px)",
          opacity: 0,
        }}
      />

      {/* Warm ignite flash — 200ms radial burst pinned at strike point. */}
      <div ref={flashRef} className="mf-flash" />

      {/* Ambient orange glow that follows the flame — also acts as
          dynamic paper lighting via multiply-blend warm wash. */}
      <div ref={glowRef} className="mf-ambient-glow" />

      {/* Heat-distortion shimmer patch that tracks the flame. */}
      <div ref={heatRef} className="mf-heat" />

      {/* Paper burn-edge glow — larger warm halo pinned at the burn origin. */}
      <div ref={burnGlowRef} className="mf-burn-glow" />

      {/* Bright pin-ember at the exact flame tip / burn origin. */}
      <div ref={emberRef} className="mf-tip-ember" />

      {/* Smoke trail layer — soft grey puffs rising from the flame path. */}
      <div ref={smokeLayerRef} className="mf-smoke-layer" />

      {/* Spark layer — tiny bright sparks flying off the flame. */}
      <div ref={sparkLayerRef} className="mf-spark-layer" />

      {/* Layer for ash flake DOM nodes emitted per-frame. */}
      <div ref={flakeLayerRef} className="mf-flake-layer" />

      {/* Afterglow ember — dims, falls, and fades once match completes. */}
      <div ref={afterglowRef} className="mf-afterglow" />

      {/* Phase marker for tests / debug. */}
      <div data-mf-phase={phase} hidden />
    </div>
  );
}

// Soft caps prevent particle counts from growing unbounded on slow
// devices where the rAF-driven emitter might outrun DOM removal.
const CAP_FLAKE = 40;
const CAP_SMOKE = 24;
const CAP_SPARK = 32;

function capLayer(layer: HTMLDivElement, cap: number) {
  while (layer.childElementCount >= cap && layer.firstElementChild) {
    layer.firstElementChild.remove();
  }
}

function spawnFlake(layer: HTMLDivElement, x: number, y: number, id: number) {
  capLayer(layer, CAP_FLAKE);
  const el = document.createElement("span");
  el.className = "mf-ashflake";
  const dx = (Math.random() - 0.5) * 22;
  const dy = 24 + Math.random() * 30;
  const dur = 700 + Math.random() * 500;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty("--fx", `${dx}px`);
  el.style.setProperty("--fy", `${dy}px`);
  el.style.animationDuration = `${dur}ms`;
  el.dataset.id = String(id);
  layer.appendChild(el);
  window.setTimeout(() => { el.remove(); }, dur + 60);
}

function spawnSmoke(layer: HTMLDivElement, x: number, y: number) {
  capLayer(layer, CAP_SMOKE);
  const el = document.createElement("span");
  el.className = "mf-smoke-puff";
  const dx = (Math.random() - 0.5) * 40;
  const dy = -(60 + Math.random() * 90);
  const dur = 1400 + Math.random() * 900;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty("--sx", `${dx}px`);
  el.style.setProperty("--sy", `${dy}px`);
  el.style.animationDuration = `${dur}ms`;
  layer.appendChild(el);
  window.setTimeout(() => { el.remove(); }, dur + 60);
}

function spawnSpark(layer: HTMLDivElement, x: number, y: number) {
  capLayer(layer, CAP_SPARK);
  const el = document.createElement("span");
  el.className = "mf-spark-fly";
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
  const dist = 22 + Math.random() * 46;
  const dx = Math.cos(angle) * dist;
  const dy = Math.sin(angle) * dist;
  const dur = 500 + Math.random() * 500;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty("--kx", `${dx}px`);
  el.style.setProperty("--ky", `${dy}px`);
  el.style.animationDuration = `${dur}ms`;
  layer.appendChild(el);
  window.setTimeout(() => { el.remove(); }, dur + 60);
}

// Polish CSS — layered ON TOP of MatchFire. The MatchFire stylesheet is
// unchanged; these classes only touch our sibling DOM.
const POLISH_CSS = `
.match-fire {
  pointer-events: none !important;
  opacity: 0;
  visibility: hidden;
  transition: opacity 480ms cubic-bezier(.22,.9,.32,1) !important;
  isolation: isolate;
}
.match-fire.is-lit {
  visibility: visible;
  opacity: 1;
}
.match-fire,
.match-fire * {
  pointer-events: none !important;
}
.mf-tremor,
.mf-flame-lean {
  isolation: isolate;
}
.mf-flame,
.mf-flame-core {
  opacity: 1 !important;
  mix-blend-mode: screen !important;
  transform-origin: 50% 100% !important;
  clip-path: ellipse(36% 46% at 50% 78%);
}
/* Gradual flame ramp — starts as a small ember and grows to full flame
   over ~520ms after the match is lit, so the fire "builds" instead of
   popping in at full size. */
.mf-flame {
  transform: scale(0.2, 0.06) !important;
  animation: mf-flame-grow 520ms cubic-bezier(.2,.7,.25,1) forwards;
}
.mf-flame-core {
  transform: scale(0.18, 0.05) !important;
  animation: mf-flame-core-grow 560ms 80ms cubic-bezier(.2,.7,.25,1) forwards;
}
.match-fire:not(.is-lit) .mf-flame,
.match-fire:not(.is-lit) .mf-flame-core {
  animation: none;
}
@keyframes mf-flame-grow {
  0%   { transform: scale(0.2, 0.06) !important; }
  40%  { transform: scale(0.2, 0.28) !important; }
  100% { transform: scale(0.2, 0.48) !important; }
}
@keyframes mf-flame-core-grow {
  0%   { transform: scale(0.18, 0.05) !important; opacity: 0 !important; }
  30%  { opacity: 0.4 !important; }
  100% { transform: scale(0.18, 0.44) !important; opacity: 0.85 !important; }
}

.mf-flash {
  position: absolute;
  width: 0; height: 0;
  pointer-events: none;
  opacity: 0;
}
.mf-flash.mf-flash-run {
  animation: mf-flash-anim 220ms ease-out forwards;
}
.mf-flash.mf-flash-run::before {
  content: "";
  position: absolute;
  left: 0; top: 0;
  width: 260px; height: 260px;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle,
    rgba(255, 190, 110, 0.55) 0%,
    rgba(255, 130, 40, 0.28) 35%,
    rgba(255, 90, 20, 0) 70%);
  filter: blur(6px);
  mix-blend-mode: screen;
  border-radius: 50%;
}
@keyframes mf-flash-anim {
  0%   { opacity: 0; }
  25%  { opacity: 1; }
  100% { opacity: 0; }
}

.mf-ambient-glow {
  position: absolute;
  left: 0; top: 0;
  width: 340px; height: 340px;
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(255, 160, 70, 0.9) 0%,
    rgba(255, 110, 40, 0.35) 40%,
    rgba(255, 80, 20, 0) 75%);
  filter: blur(24px);
  mix-blend-mode: screen;
  opacity: 0;
  transition: opacity 120ms linear;
  will-change: transform, opacity;
}

.mf-tip-ember {
  position: absolute;
  left: 0; top: 0;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(255, 240, 200, 1) 0%,
    rgba(255, 150, 60, 0.9) 45%,
    rgba(255, 90, 20, 0) 75%);
  box-shadow: 0 0 18px 4px rgba(255, 140, 50, 0.55);
  mix-blend-mode: screen;
  opacity: 0;
  transition: opacity 150ms linear;
  will-change: transform, opacity;
}

.mf-flake-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.mf-ashflake {
  position: absolute;
  width: 2px; height: 2px;
  background: rgba(20, 14, 10, 0.85);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation-name: mf-ashflake-fall;
  animation-timing-function: ease-in;
  animation-fill-mode: forwards;
  opacity: 0.9;
}
@keyframes mf-ashflake-fall {
  0%   { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
  100% { transform: translate(calc(-50% + var(--fx, 0)), calc(-50% + var(--fy, 20px))) scale(0.4); opacity: 0; }
}

.mf-afterglow {
  position: absolute;
  width: 0; height: 0;
  pointer-events: none;
  opacity: 0;
}
.mf-afterglow.mf-afterglow-run::before {
  content: "";
  position: absolute;
  left: 0; top: 0;
  width: 40px; height: 40px;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle,
    rgba(255, 200, 120, 0.9) 0%,
    rgba(255, 120, 40, 0.5) 45%,
    rgba(255, 80, 20, 0) 75%);
  filter: blur(3px);
  mix-blend-mode: screen;
  border-radius: 50%;
  animation: mf-afterglow-anim 900ms ease-out forwards;
}
.mf-afterglow.mf-afterglow-run::after {
  content: "";
  position: absolute;
  left: 0; top: 0;
  width: 6px; height: 6px;
  transform: translate(-50%, -50%);
  background: rgba(210, 210, 210, 0.45);
  border-radius: 50%;
  filter: blur(2px);
  animation: mf-afterglow-smoke 900ms ease-out forwards;
}
@keyframes mf-afterglow-anim {
  0%   { opacity: 1;   transform: translate(-50%, -50%) scale(1); }
  40%  { opacity: 0.55; transform: translate(-50%, calc(-50% + 4px)) scale(0.85); }
  100% { opacity: 0;    transform: translate(-50%, calc(-50% + 22px)) scale(0.4); }
}
@keyframes mf-afterglow-smoke {
  0%   { opacity: 0;   transform: translate(-50%, -50%) scale(1); }
  30%  { opacity: 0.5; }
  100% { opacity: 0;   transform: translate(calc(-50% + 8px), calc(-50% - 36px)) scale(2.2); }
}

/* Heat distortion shimmer patch — SVG turbulence displaces a warm radial
   so the air around the flame ripples like real heat haze. */
.mf-heat {
  position: absolute;
  left: 0; top: 0;
  width: 220px; height: 260px;
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(255,180,90,0.35) 0%,
    rgba(255,140,60,0.15) 40%,
    rgba(255,100,30,0) 75%);
  filter: url(#mf-heat-distort) blur(2px);
  mix-blend-mode: screen;
  opacity: 0;
  transition: opacity 160ms linear;
  will-change: transform, opacity;
}

/* Larger warm burn-edge halo — dynamic paper lighting. Multiply-blends
   a warm wash under the flame so the paper itself looks lit up. */
.mf-burn-glow {
  position: absolute;
  left: 0; top: 0;
  width: 460px; height: 460px;
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(255,210,140,0.55) 0%,
    rgba(255,140,60,0.32) 30%,
    rgba(230,80,20,0.18) 55%,
    rgba(120,30,0,0) 78%);
  filter: blur(30px);
  mix-blend-mode: screen;
  opacity: 0;
  transition: opacity 200ms linear;
  will-change: transform, opacity;
}

/* Soft rising smoke puffs. */
.mf-smoke-layer { position: absolute; inset: 0; pointer-events: none; }
.mf-smoke-puff {
  position: absolute;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(230,225,220,0.55) 0%,
    rgba(180,175,170,0.28) 55%,
    rgba(120,115,110,0) 100%);
  filter: blur(6px);
  transform: translate(-50%, -50%);
  animation-name: mf-smoke-drift;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
  mix-blend-mode: screen;
  opacity: 0;
  will-change: transform, opacity;
}
@keyframes mf-smoke-drift {
  0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
  15%  { opacity: 0.55; }
  100% { transform: translate(calc(-50% + var(--sx, 0)), calc(-50% + var(--sy, -80px))) scale(2.6); opacity: 0; }
}

/* Tiny bright sparks. */
.mf-spark-layer { position: absolute; inset: 0; pointer-events: none; }
.mf-spark-fly {
  position: absolute;
  width: 2.5px; height: 2.5px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff5c8 0%, #ffcf6b 55%, rgba(255,140,40,0) 100%);
  box-shadow: 0 0 6px 1px rgba(255,190,90,0.9);
  transform: translate(-50%, -50%);
  animation-name: mf-spark-arc;
  animation-timing-function: cubic-bezier(.2,.7,.4,1);
  animation-fill-mode: forwards;
  mix-blend-mode: screen;
  will-change: transform, opacity;
}
@keyframes mf-spark-arc {
  0%   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  60%  { opacity: 0.9; }
  100% { transform: translate(calc(-50% + var(--kx, 0)), calc(-50% + var(--ky, -40px))) scale(0.2); opacity: 0; }
}
`;
