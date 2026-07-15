// Standard Mode: the 2D interpretation of the Fire ritual for devices that
// cannot drive the 3D scene at 60fps, or for users with prefers-reduced-
// motion. Same timeline, same copy, no canvas.

import { AnimatePresence, motion, useAnimationFrame } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import type { Beat } from "@/lib/farewell/director";
import { envelopePath, envelopePathSplit, type VoicePeaks } from "@/lib/farewell/waveform";
import type { VoiceController } from "@/lib/farewell/voice-transport";

export type StandardModeSceneProps = {
  title: string;
  content: string;
  beat: Beat;
  tRef: MutableRefObject<number>;
  burnOriginRef?: MutableRefObject<{ u: number; v: number } | null>;
  /** External ref that receives the rendered paper element. MatchFireOverlay
   *  reads this on mobile to size its travel box to the paper's bounding
   *  rect so the match starts / ends just outside the paper edges. */
  paperElRef?: MutableRefObject<HTMLDivElement | null>;
  voicePeaks?: VoicePeaks | null;
  voiceOnly?: boolean;
  // READ-ONLY inside StandardModeScene: only for subscribing to
  // `play`/`pause`/`ended`/`timeupdate` and reading `currentTime` for
  // display. All mutations MUST go through `voiceController`.
  voiceRef?: MutableRefObject<HTMLAudioElement | null>;
  voiceController?: VoiceController;
  voiceDuration?: number;
  transportLocked?: boolean;
};



function isImageContent(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  return (
    t.startsWith("data:image/") ||
    /^https?:\/\/.+\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i.test(t) ||
    t.startsWith("blob:")
  );
}

export function StandardModeScene({
  title, content, beat, tRef, burnOriginRef, paperElRef,
  voicePeaks, voiceOnly, voiceRef, voiceController, voiceDuration, transportLocked,
}: StandardModeSceneProps) {
  // On phones/tablets, keep the paper perfectly centered and stationary
  // throughout the ritual: no idle drift, no rotation, no voice scale
  // pulse. Only the match/fire moves. Desktop keeps its existing motion.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  const ambientRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const paperInnerRef = useRef<HTMLDivElement | null>(null);
  const emberRef = useRef<HTMLDivElement | null>(null);
  const charRef = useRef<HTMLDivElement | null>(null);
  const scorchRef = useRef<HTMLDivElement | null>(null);
  const burnParticleLayerRef = useRef<HTMLDivElement | null>(null);
  const ashResidueLayerRef = useRef<HTMLDivElement | null>(null);
  const finalEmberRef = useRef<HTMLDivElement | null>(null);
  const candleRef = useRef<HTMLDivElement | null>(null);
  const lastParticleAtRef = useRef(0);
  const lastAshAtRef = useRef(0);
  const lastFinalAshAtRef = useRef(0);
  const lastBurnRef = useRef(0);

  // Track voice playback state so the paper reacts with a tiny pulse
  // whenever the memory is heard aloud.
  const [voicePlaying, setVoicePlaying] = useState(false);
  useEffect(() => {
    const a = voiceRef?.current;
    if (!a) return;
    const onPlay = () => setVoicePlaying(true);
    const onStop = () => setVoicePlaying(false);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onStop);
    a.addEventListener("ended", onStop);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onStop);
      a.removeEventListener("ended", onStop);
    };
  }, [voiceRef]);

  useAnimationFrame((time) => {
    const t = tRef.current;
    const burn =
      beat === "arrival" || beat === "contemplation" || beat === "invitation"
        ? 0
        : beat === "transformation"
        ? Math.min(1, t)
        : 1;

    if (ambientRef.current) {
      ambientRef.current.style.transform = `scale(${1 + burn * 0.4})`;
    }

    // Very slow candlelight brightness variation — barely perceptible.
    if (candleRef.current && !burn) {
      const flicker =
        0.88 +
        Math.sin(time * 0.00042) * 0.06 +
        Math.sin(time * 0.00113) * 0.03;
      candleRef.current.style.opacity = flicker.toFixed(3);
    }

    // Ignition warmth: right when the flame first bites, wash the paper
    // with a brief amber glow before the burn mask starts eating it.
    if (paperInnerRef.current) {
      let warm = 0;
      if (beat === "transformation" && t < 0.08) {
        warm = 1 - t / 0.08;
      }
      const pulse = voicePlaying && burn === 0 ? 0.06 : 0;
      const bright = 1 + pulse;
      paperInnerRef.current.style.filter = warm > 0
        ? `brightness(${(bright + warm * 0.12).toFixed(3)}) sepia(${(warm * 0.45).toFixed(3)}) saturate(${(1 + warm * 0.8).toFixed(3)})`
        : pulse > 0
        ? `brightness(${bright.toFixed(3)})`
        : "none";
    }

    if (paperRef.current) {
      const o = burnOriginRef?.current ?? { u: 0.5, v: 0.02 };
      const mx = Math.max(0, Math.min(1, o.u)) * 100;
      const my = (1 - Math.max(0, Math.min(1, o.v))) * 100;
      // Slightly offset twin gradients so the transparent boundary breaks
      // circular symmetry — reads as an organic burn front rather than a
      // perfect disc eating the paper.
      const inner = burn * 130;
      const outer = inner + Math.max(10, 28 - burn * 14);
      const jx = Math.sin(time * 0.0021) * 3;
      const jy = Math.cos(time * 0.0017) * 3;
      const mask = burn > 0
        ? `radial-gradient(circle at ${mx + jx}% ${my + jy}%, transparent 0%, transparent ${inner}%, black ${outer}%, black 100%), radial-gradient(circle at ${mx - jx * 0.6}% ${my - jy * 0.6}%, transparent 0%, transparent ${inner * 0.94}%, black ${outer * 0.96}%, black 100%)`
        : "none";
      paperRef.current.style.maskComposite = "intersect";
      (paperRef.current.style as CSSStyleDeclaration & { webkitMaskComposite?: string }).webkitMaskComposite = "source-in";
      paperRef.current.style.maskImage = mask;
      paperRef.current.style.webkitMaskImage = mask;
      // Turbulence displacement — warps the mask edge into a torn, ragged
      // paper tear instead of a smooth arc. Filter is defined inline in JSX.
      paperRef.current.style.filter = burn > 0.01 && burn < 0.99
        ? "url(#paper-burn-tear)"
        : "none";
    }
    // Scorch preheat — a wide brown/black darkening ring AHEAD of the
    // transparent hole. Paper visibly darkens and chars before it's eaten.
    if (scorchRef.current) {
      const o = burnOriginRef?.current ?? { u: 0.5, v: 0.02 };
      const mx = Math.max(0, Math.min(1, o.u)) * 100;
      const my = (1 - Math.max(0, Math.min(1, o.v))) * 100;
      const r = burn * 130;
      if (burn > 0.005 && burn < 0.99) {
        scorchRef.current.style.opacity = "1";
        // Deep black at burn front → warm brown scorch → clean paper
        scorchRef.current.style.backgroundImage =
          `radial-gradient(circle at ${mx}% ${my}%, ` +
            `rgba(10,4,2,0.95) ${Math.max(0, r - 2)}%, ` +
            `rgba(28,12,6,0.85) ${r + 2}%, ` +
            `rgba(74,36,14,0.55) ${r + 8}%, ` +
            `rgba(120,64,24,0.28) ${r + 16}%, ` +
            `transparent ${r + 26}%)`;
      } else {
        scorchRef.current.style.opacity = "0";
      }
    }
    // Charred edge ring — a narrow dark band riding the burn front. The
    // blur+contrast filter turns a smooth radial band into a ragged, ashy
    // frontier so the paper's edge looks eaten, not scissored.
    if (charRef.current) {
      const o = burnOriginRef?.current ?? { u: 0.5, v: 0.02 };
      const mx = Math.max(0, Math.min(1, o.u)) * 100;
      const my = (1 - Math.max(0, Math.min(1, o.v))) * 100;
      const r = burn * 130;
      if (burn > 0.01 && burn < 0.99) {
        charRef.current.style.opacity = "1";
        charRef.current.style.backgroundImage =
          `radial-gradient(circle at ${mx}% ${my}%, transparent 0%, transparent ${Math.max(0, r - 4)}%, #120905 ${r}%, #2a1409 ${r + 3}%, transparent ${r + 6}%)`;
      } else {
        charRef.current.style.opacity = "0";
      }
    }
    if (emberRef.current) {
      const o = burnOriginRef?.current ?? { u: 0.5, v: 0.02 };
      const mx = Math.max(0, Math.min(1, o.u)) * 100;
      const my = (1 - Math.max(0, Math.min(1, o.v))) * 100;
      const visible = burn > 0.02 && burn < 0.98;
      emberRef.current.style.opacity = visible ? "1" : "0";
      const r = burn * 130;
      emberRef.current.style.background =
        `radial-gradient(circle at ${mx}% ${my}%, transparent ${Math.max(0, r - 8)}%, oklch(0.78 0.22 45 / 0.9) ${r}%, transparent ${r + 6}%)`;
    }

    // Spawn embers + smoke along the advancing burn front while the paper
    // is actively transforming. Emission rate scales with burn velocity so
    // fast-spreading fire spits more sparks than slow smoulder.
    if (
      beat === "transformation" &&
      paperRef.current &&
      burnParticleLayerRef.current &&
      burn > 0.02 &&
      burn < 0.96
    ) {
      const dBurn = burn - lastBurnRef.current;
      lastBurnRef.current = burn;
      const rate = 40 - Math.min(35, dBurn * 6000); // ms between spawns (denser)
      if (time - lastParticleAtRef.current > rate) {
        lastParticleAtRef.current = time;
        const rect = paperRef.current.getBoundingClientRect();
        const layerRect = burnParticleLayerRef.current.getBoundingClientRect();
        const o = burnOriginRef?.current ?? { u: 0.5, v: 0.02 };
        const originX = rect.left + rect.width * Math.max(0, Math.min(1, o.u));
        const originY = rect.top + rect.height * (1 - Math.max(0, Math.min(1, o.v)));
        // Sample a random angle on the burn-front circle, radius ≈ burn*paperDiag
        const radius = burn * Math.hypot(rect.width, rect.height) * 0.65;
        const ang = Math.random() * Math.PI * 2;
        const px = originX + Math.cos(ang) * radius - layerRect.left;
        const py = originY + Math.sin(ang) * radius - layerRect.top;
        // Only emit if the sample lands inside the paper rect (otherwise
        // sparks appear on empty ambient space).
        const insideX = px > 0 && px < rect.width;
        const insideY = py > 0 && py < rect.height;
        if (insideX && insideY) {
          const roll = Math.random();
          const kind: "ember" | "smoke" | "ash" =
            roll < 0.30 ? "smoke" : roll < 0.55 ? "ash" : "ember";
          spawnBurnParticle(burnParticleLayerRef.current, px, py, kind);
        }
      }

      // Ash flakes drifting down from the burning edges — spawn along the
      // lower arc of the burn front so they visibly fall from where the
      // paper is being consumed.
      if (time - lastAshAtRef.current > 90) {
        lastAshAtRef.current = time;
        const rect = paperRef.current.getBoundingClientRect();
        const layerRect = burnParticleLayerRef.current.getBoundingClientRect();
        const o = burnOriginRef?.current ?? { u: 0.5, v: 0.02 };
        const originX = rect.left + rect.width * Math.max(0, Math.min(1, o.u));
        const originY = rect.top + rect.height * (1 - Math.max(0, Math.min(1, o.v)));
        const radius = burn * Math.hypot(rect.width, rect.height) * 0.6;
        // bias angle to lower half so ash flakes fall from the burning belly
        const ang = Math.PI * (0.15 + Math.random() * 0.7);
        const px = originX + Math.cos(ang) * radius - layerRect.left;
        const py = originY + Math.sin(ang) * radius - layerRect.top;
        if (px > 0 && px < rect.width && py > 0 && py < rect.height) {
          spawnBurnParticle(burnParticleLayerRef.current, px, py, "ash");
        }
      }
    } else {
      lastBurnRef.current = burn;
    }


    // Final lingering ember — appears the moment the paper finishes
    // burning and slowly fades over the following seconds of silence.
    if (finalEmberRef.current) {
      let o = 0;
      if (beat === "stillness") {
        // fade in fast, then slowly down over the whole stillness beat
        o = t < 0.06 ? t / 0.06 : Math.max(0, 1 - (t - 0.06) / 0.94);
      } else if (beat === "return") {
        o = Math.max(0, 0.35 * (1 - t));
      }
      finalEmberRef.current.style.opacity = o.toFixed(3);
    }

    // Residual ash — after the paper is gone, a slow drift of dark flakes
    // dissipates from where the paper used to be. Fades out with stillness.
    if (
      ashResidueLayerRef.current &&
      (beat === "stillness" || (beat === "transformation" && burn > 0.9))
    ) {
      const decay = beat === "stillness" ? Math.max(0, 1 - t * 1.15) : 1;
      if (decay > 0 && time - lastFinalAshAtRef.current > 130) {
        lastFinalAshAtRef.current = time;
        const layer = ashResidueLayerRef.current;
        const lr = layer.getBoundingClientRect();
        // spawn in a small cloud centered on the layer (paper's former center)
        const cx = lr.width / 2 + (Math.random() - 0.5) * lr.width * 0.55;
        const cy = lr.height / 2 + (Math.random() - 0.5) * lr.height * 0.35;
        spawnBurnParticle(layer, cx, cy, "ash");
      }
    }
  });

  const showImage = !voiceOnly && isImageContent(content);
  const preIgnition =
    beat === "arrival" || beat === "contemplation" || beat === "invitation";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_center,oklch(0.16_0.03_30)_0%,oklch(0.06_0.02_25)_65%,oklch(0.03_0.01_20)_100%)]">
      <div
        ref={candleRef}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.62 0.2 55 / 0.22), transparent 70%)",
          filter: "blur(6px)",
        }}
      />
      <div
        ref={ambientRef}
        className="absolute inset-x-0 bottom-0 h-2/3 opacity-70"
        style={{
          background: "radial-gradient(ellipse at 50% 100%, oklch(0.55 0.18 40 / 0.55), transparent 65%)",
          transition: "transform 400ms ease-out",
        }}
      />

      {/* Idle drift wrapper — very slow floating motion + rotation during
          pre-ignition on desktop. On mobile the paper is locked to the
          center and does not drift, translate, or rotate; only the burn
          mask on inner refs animates. */}
      <motion.div
        initial={isMobile ? { y: 0, rotate: 0 } : { y: 40, rotate: -2 }}
        animate={
          isMobile
            ? { y: 0, rotate: 0, x: 0 }
            : preIgnition
              ? {
                  y: [0, -2, 0.5, -1, 0],
                  rotate: [-1.0, -0.6, -1.2, -0.8, -1.0],
                  x: [0, 1.5, -1, 0.5, 0],
                }
              : { y: 0, rotate: -1, x: 0 }
        }
        style={{ opacity: 1 }}
        transition={
          isMobile
            ? { duration: 0 }
            : preIgnition
              ? { duration: 14, repeat: Infinity, ease: "easeInOut" }
              : { duration: 1.2, ease: [0.22, 1, 0.36, 1] }
        }
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${voiceOnly ? "w-[min(88vw,600px)]" : "w-[min(78vw,520px)]"}`}
      >
        {/* Voice weight — subtle scale pulse while playback is live.
            Suppressed on mobile so the paper stays perfectly still. */}
        <motion.div
          animate={{
            scale: !isMobile && voicePlaying && preIgnition ? [1, 1.006, 1] : 1,
          }}
          transition={
            !isMobile && voicePlaying && preIgnition
              ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.6, ease: "easeOut" }
          }
        >
          <div
            ref={(el) => {
              paperRef.current = el;
              if (paperElRef) paperElRef.current = el;
            }}
            className="relative rounded-md p-8 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
            style={{
              background: "linear-gradient(180deg, #f4e6c9, #e8d3a2)",
              transformOrigin: "top left",
            }}
          >
            <div ref={paperInnerRef} className="relative">
              <div className="mb-3 text-[10px] uppercase tracking-[0.28em] text-black/50">Lumina</div>

              {voiceOnly ? (
                <VoiceOnlyPaper
                  peaks={voicePeaks ?? null}
                  voiceRef={voiceRef}
                  controller={voiceController}
                  durationHint={voiceDuration}
                  interactive={preIgnition && !transportLocked}
                  burnActive={!preIgnition}
                />
              ) : (
                <>
                  <div className="font-display text-2xl leading-tight text-black/85 sm:text-3xl">
                    {title || "Untitled"}
                  </div>
                  {showImage ? (
                    <div className="mt-4 flex justify-center">
                      <img
                        src={content.trim()}
                        alt={title || "Memory"}
                        draggable={false}
                        loading="lazy"
                        decoding="async"
                        className="max-h-[52vh] w-auto max-w-full rounded-sm object-contain shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]"
                      />
                    </div>
                  ) : (
                    <div className="mt-4 line-clamp-[8] whitespace-pre-wrap text-sm leading-relaxed text-black/75">
                      {content || "…"}
                    </div>
                  )}
                  {voicePeaks && voicePeaks.top.length > 0 ? (
                    <div className="mt-6 border-t border-black/15 pt-4">
                      <Waveform
                        peaks={voicePeaks}
                        height={44}
                        voiceRef={voiceRef}
                        controller={voiceController}
                        durationHint={voiceDuration}
                        interactive={preIgnition && !transportLocked}
                        burnActive={!preIgnition}
                        signature
                        compact
                      />
                    </div>
                  ) : null}

                </>
              )}
            </div>

            {/* Scorch preheat — wide brown/black darkening AHEAD of the
                transparent hole. Paper visibly darkens and chars before it
                disappears. Sits under char/ember so it reads as depth. */}
            <div
              ref={scorchRef}
              className="pointer-events-none absolute inset-0 rounded-md"
              style={{
                opacity: 0,
                mixBlendMode: "multiply",
                filter: "blur(2px)",
              }}
            />
            {/* Charred edge — narrow dark band riding the burn front.
                Blur+contrast turns the smooth radial into a ragged,
                organic ashy frontier instead of a scissor-cut circle. */}
            <div
              ref={charRef}
              className="pointer-events-none absolute inset-0 rounded-md"
              style={{
                opacity: 0,
                mixBlendMode: "multiply",
                filter: "blur(3px) contrast(18)",
              }}
            />
            <div
              ref={emberRef}
              className="absolute inset-0 rounded-md"
              style={{
                opacity: 0,
                mixBlendMode: "screen",
                filter: "blur(3px)",
              }}
            />
          </div>
        </motion.div>

        {/* Burn particle layer — sits OUTSIDE the paper's mask so embers
            and smoke keep rendering after the paper transparent-hole has
            eaten the area they were spawned from. */}
        <div
          ref={burnParticleLayerRef}
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        />

        {/* Residual ash layer — after the paper is gone, dark flakes drift
            from where it used to be and fade out over the stillness beat. */}
        <div
          ref={ashResidueLayerRef}
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        />

        {/* Final lingering ember at the burn origin — pinpoint of warmth
            after the paper has fully turned to nothing. Sits over where
            the paper used to be so it feels like the last coal of it. */}
        <div
          ref={finalEmberRef}
          className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            opacity: 0,
            background:
              "radial-gradient(circle, #fff2c7 0%, #ffb066 35%, #ff7a2a 65%, transparent 100%)",
            boxShadow:
              "0 0 24px 6px rgba(255, 138, 61, 0.55), 0 0 48px 14px rgba(255, 90, 20, 0.25)",
          }}
        />
      </motion.div>

      {/* SVG turbulence filter — warps the paper burn mask edge into a
          torn, irregular tear rather than a clean radial. Kept subtle so
          the paper never looks glitchy. */}
      <svg
        className="pointer-events-none absolute -z-10 h-0 w-0"
        aria-hidden="true"
      >
        <defs>
          <filter id="paper-burn-tear" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.022 0.03"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="6"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <style>{BURN_PARTICLE_CSS}</style>
    </div>
  );
}

// ------------------------------------------------------------
// Burn-front particle emission (embers + smoke)
// ------------------------------------------------------------

function spawnBurnParticle(
  layer: HTMLDivElement,
  x: number,
  y: number,
  kind: "ember" | "smoke" | "ash",
) {
  const el = document.createElement("span");
  el.className =
    kind === "smoke" ? "burn-smoke" : kind === "ash" ? "burn-ash" : "burn-ember";
  // Horizontal drift: modest jitter with a light breeze for smoke/ash.
  const dx =
    kind === "smoke"
      ? (Math.random() - 0.5) * 60 + 8
      : kind === "ash"
      ? (Math.random() - 0.5) * 30
      : (Math.random() - 0.5) * 26;
  // Vertical: embers arc UP briefly then fall via keyframe scale of dy.
  // Smoke rises. Ash falls (positive dy — down).
  const dy =
    kind === "smoke"
      ? -(80 + Math.random() * 60)
      : kind === "ash"
      ? 60 + Math.random() * 90
      : -(20 + Math.random() * 18); // ember initial rise
  const dyFall = kind === "ember" ? 60 + Math.random() * 60 : 0; // ember gravity fall
  const dur =
    kind === "smoke"
      ? 1400 + Math.random() * 1000
      : kind === "ash"
      ? 1800 + Math.random() * 1400
      : 900 + Math.random() * 600;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty("--bpx", `${dx}px`);
  el.style.setProperty("--bpy", `${dy}px`);
  el.style.setProperty("--bpy2", `${dy + dyFall}px`);
  if (kind === "ash") {
    // slight rotation so flakes tumble
    el.style.setProperty("--brot", `${(Math.random() - 0.5) * 220}deg`);
    // vary flake size
    const s = 2 + Math.random() * 3;
    el.style.width = `${s}px`;
    el.style.height = `${s * (0.6 + Math.random() * 0.8)}px`;
  }
  el.style.animationDuration = `${dur}ms`;
  layer.appendChild(el);
  window.setTimeout(() => { el.remove(); }, dur + 60);
}

const BURN_PARTICLE_CSS = `
.burn-ember, .burn-smoke, .burn-ash {
  position: absolute;
  pointer-events: none;
  transform: translate(-50%, -50%);
  will-change: transform, opacity;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}
.burn-ember {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff5c9 0%, #ffb45a 45%, #ff5a1a 80%, transparent 100%);
  box-shadow: 0 0 6px 1px rgba(255, 150, 60, 0.95), 0 0 14px 3px rgba(255, 90, 20, 0.55);
  mix-blend-mode: screen;
  animation-name: burn-ember-fly;
}
.burn-smoke {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(50, 42, 38, 0.5);
  filter: blur(5px);
  animation-name: burn-smoke-rise;
}
.burn-ash {
  width: 3px;
  height: 2px;
  border-radius: 1px;
  background: linear-gradient(180deg, #1a1310 0%, #2a1e18 60%, #0a0605 100%);
  box-shadow: 0 0 1px rgba(0,0,0,0.6);
  animation-name: burn-ash-fall;
  animation-timing-function: cubic-bezier(0.35, 0, 0.65, 1);
}
@keyframes burn-ember-fly {
  0%   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  35%  { transform: translate(calc(-50% + var(--bpx, 0) * 0.4), calc(-50% + var(--bpy, -20px))) scale(0.85); opacity: 0.95; }
  100% { transform: translate(calc(-50% + var(--bpx, 0)), calc(-50% + var(--bpy2, 40px))) scale(0.2); opacity: 0; }
}
@keyframes burn-smoke-rise {
  0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
  20%  { opacity: 0.55; }
  100% { transform: translate(calc(-50% + var(--bpx, 0)), calc(-50% + var(--bpy, -80px))) scale(3.2); opacity: 0; }
}
@keyframes burn-ash-fall {
  0%   { transform: translate(-50%, -50%) rotate(0deg) scale(1); opacity: 0; }
  10%  { opacity: 0.85; }
  100% { transform: translate(calc(-50% + var(--bpx, 0)), calc(-50% + var(--bpy, 80px))) rotate(var(--brot, 60deg)) scale(0.9); opacity: 0; }
}
`;




/* ------------------------------------------------------------ */
/* Voice-only paper — title + subtitle + centered waveform      */
/* ------------------------------------------------------------ */

function VoiceOnlyPaper({
  peaks,
  voiceRef,
  controller,
  durationHint,
  interactive,
  burnActive,
}: {
  peaks: VoicePeaks | null;
  voiceRef?: MutableRefObject<HTMLAudioElement | null>;
  controller?: VoiceController;
  durationHint?: number;
  interactive: boolean;
  burnActive: boolean;
}) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div className="text-[10px] font-medium uppercase tracking-[0.42em] text-black/45">
        L&nbsp;U&nbsp;M&nbsp;I&nbsp;N&nbsp;A
      </div>
      <div className="mt-4 font-display text-[26px] leading-tight text-black/85 sm:text-[30px]">
        A Spoken Farewell
      </div>
      <p className="mt-3 font-display text-[13px] italic leading-[1.7] text-black/60">
        These words were spoken,
        <br />not written.
      </p>
      <p className="mt-2 font-display text-[13px] italic leading-[1.7] text-black/60">
        Held only long enough
        <br />to be released.
      </p>
      <div className="mt-6 w-full px-1">
        <Waveform
          peaks={peaks}
          height={72}
          voiceRef={voiceRef}
          controller={controller}
          durationHint={durationHint}
          interactive={interactive}
          burnActive={burnActive}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Waveform — continuous ink envelope with pro transport UI      */
/* ------------------------------------------------------------ */

// Deterministic 0..1 from index — imperfect ink pattern is stable.
function seedRand(i: number, seed = 1): number {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// (Soft fade helpers moved to @/lib/farewell/voice-transport and are
// invoked exclusively by FarewellScene — the sole owner of the ritual
// HTMLAudioElement. Waveform is presentation only.)


function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function positiveDuration(s?: number) {
  return typeof s === "number" && isFinite(s) && s > 0 ? s : 0;
}

function Waveform({
  peaks,
  height,
  voiceRef,
  controller,
  durationHint,
  interactive,
  burnActive,
  signature = false,
  compact = false,
}: {
  peaks: VoicePeaks | null;
  height: number;
  voiceRef?: MutableRefObject<HTMLAudioElement | null>;
  controller?: VoiceController;
  durationHint?: number;
  interactive: boolean;
  burnActive: boolean;
  signature?: boolean;
  compact?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(() => positiveDuration(durationHint));
  const [current, setCurrent] = useState(0);
  const [hover, setHover] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const rafRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const hinted = positiveDuration(durationHint);
    if (hinted > 0) setDuration(hinted);
  }, [durationHint]);

  // READ-ONLY audio observation. Waveform listens to events and polls
  // currentTime for display; it never mutates the element.
  useEffect(() => {
    const a = voiceRef?.current;
    if (!a) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setProgress(1);
    };
    const onMeta = () => {
      const d = positiveDuration(a.duration);
      if (d > 0) setDuration(d);
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("canplay", onMeta);
    a.addEventListener("canplaythrough", onMeta);
    if (a.readyState >= 1) onMeta();
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("canplay", onMeta);
      a.removeEventListener("canplaythrough", onMeta);
    };
  }, [voiceRef]);

  // Poll audio time every frame while playing OR scrubbing. Read-only.
  useEffect(() => {
    if (!playing && !scrubbing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = () => {
      const a = voiceRef?.current;
      if (a) {
        setCurrent(a.currentTime);
        const d = isFinite(a.duration) && a.duration > 0 ? a.duration : duration;
        if (d > 0) setProgress(Math.min(1, a.currentTime / d));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, scrubbing, voiceRef, duration]);

  // ----- Transport controls: request-only, no direct mutation -----
  const requestPlay = useCallback(() => {
    if (!interactive || !controller || controller.isLocked()) return;
    if (progress >= 0.999) controller.requestReplay();
    else controller.requestPlay();
  }, [interactive, controller, progress]);

  const requestPause = useCallback(() => {
    if (!controller || controller.isLocked()) return;
    controller.requestPause();
  }, [controller]);

  const toggle = useCallback(() => {
    if (!interactive || !controller || controller.isLocked()) return;
    if (playing) requestPause(); else requestPlay();
  }, [interactive, controller, playing, requestPlay, requestPause]);

  const skip = useCallback((delta: number) => {
    if (!interactive || !controller || controller.isLocked()) return;
    const a = voiceRef?.current;
    const d = a && isFinite(a.duration) && a.duration > 0 ? a.duration : duration;
    if (d <= 0) return;
    const currentT = a ? a.currentTime : current;
    const next = Math.max(0, Math.min(d - 0.001, currentT + delta));
    controller.requestSeek(next);
    // Optimistic UI so the transport display updates immediately.
    setCurrent(next);
    setProgress(next / d);
  }, [interactive, controller, voiceRef, duration, current]);

  // Keyboard shortcuts — only while the transport is interactive.
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); skip(-10); }
      else if (e.code === "ArrowRight") { e.preventDefault(); skip(10); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interactive, toggle, skip]);

  // ----- Scrubbing (request-only) -----
  const seekFromPointer = (e: ReactPointerEvent) => {
    const svg = svgRef.current;
    if (!svg || !controller || controller.isLocked()) return;
    const rect = svg.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const a = voiceRef?.current;
    const d = a && isFinite(a.duration) && a.duration > 0 ? a.duration : duration;
    setProgress(p);
    if (d > 0) {
      const target = p * d;
      controller.requestSeek(target);
      setCurrent(target);
    }
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    if (!interactive) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setScrubbing(true);
    seekFromPointer(e);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!scrubbing) return;
    seekFromPointer(e);
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (!scrubbing) return;
    setScrubbing(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    // Drag-to-seek is optional and NEVER auto-starts playback.
  };

  // ----- Path geometry -----
  const w = 1000;
  const h = 100;
  const midY = h / 2;
  const activePeaks: VoicePeaks | null = useMemo(() => {
    if (peaks && peaks.top.length > 0) return peaks;
    return null;
  }, [peaks]);

  // Fallback (still ink-looking) if the audio hasn't decoded yet.
  const fallbackPeaks: VoicePeaks = useMemo(() => {
    const N = 220;
    const top = new Array(N);
    const bot = new Array(N);
    for (let i = 0; i < N; i++) {
      const v = 0.08 + 0.06 * Math.abs(Math.sin(i / 4));
      top[i] = v; bot[i] = v;
    }
    return { top, bottom: bot, mag: top.slice() };
  }, []);

  const pk = activePeaks ?? fallbackPeaks;

  const paths = useMemo(() => {
    const split = envelopePathSplit(pk, w, h, Math.max(0, Math.min(1, progress)), {
      minPx: 0.8,
      padY: 3,
    });
    const full = envelopePath(pk, w, h, { minPx: 0.8, padY: 3 });
    return { ...split, full };
  }, [pk, progress]);

  const playheadX = progress * w;

  // Small trailing sparks — deterministic based on playhead.
  const sparks = playing
    ? Array.from({ length: 4 }).map((_, k) => {
        const j = seedRand(Math.floor(progress * 1000) + k, k + 3);
        return {
          x: Math.max(0, playheadX - 4 - k * 6 - j * 8),
          y: midY + (j - 0.5) * 20,
          r: 1 + j * 1.4,
          o: 0.35 - k * 0.07,
        };
      })
    : [];

  const inkId = `wf-ink-${signature ? "sig" : "main"}`;
  const playedId = `wf-played-${signature ? "sig" : "main"}`;
  const filterId = `wf-bleed-${signature ? "sig" : "main"}`;
  const emberId = `wf-ember-${signature ? "sig" : "main"}`;

  return (
    <div
      className={`relative w-full select-none transition-[filter] duration-500 ${
        interactive ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
      }`}
      style={{
        filter: hover && interactive
          ? "drop-shadow(0 0 10px rgba(255, 138, 61, 0.28))"
          : "none",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
        style={{ height, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role={interactive ? "slider" : undefined}
        aria-label={interactive ? "Voice memory scrubber" : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <defs>
          <linearGradient id={inkId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor="#3a3230" stopOpacity="0.92" />
            <stop offset="50%"  stopColor="#2A2522" stopOpacity="1" />
            <stop offset="100%" stopColor="#3a3230" stopOpacity="0.92" />
          </linearGradient>
          <linearGradient id={playedId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor="#c25a1a" stopOpacity="0.95" />
            <stop offset="50%"  stopColor="#8a2f0a" stopOpacity="1" />
            <stop offset="100%" stopColor="#c25a1a" stopOpacity="0.95" />
          </linearGradient>
          <filter id={filterId} x="-4%" y="-20%" width="108%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="0.5" />
            <feGaussianBlur stdDeviation="0.28" />
          </filter>
          <radialGradient id={emberId} cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#fff2c7" stopOpacity="1" />
            <stop offset="35%" stopColor="#ffb066" stopOpacity="0.95" />
            <stop offset="70%" stopColor="#ff7a2a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ff7a2a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ink bleed halo (full envelope, very soft, wider) */}
        <path
          d={paths.full}
          fill={`url(#${inkId})`}
          opacity={burnActive ? 0.16 : 0.22}
          style={{ transform: "scale(1, 1.04)", transformOrigin: `50% ${midY}px` }}
        />

        {/* Remaining (charcoal) ink — filtered for imperfect edge */}
        <g filter={`url(#${filterId})`}>
          <path
            d={paths.remaining}
            fill={`url(#${inkId})`}
            opacity={burnActive ? 0.78 : 0.92}
          />
        </g>

        {/* Played (warm orange) ink */}
        <g filter={`url(#${filterId})`}>
          <path
            d={paths.played}
            fill={`url(#${playedId})`}
            opacity={burnActive ? 0.85 : 0.95}
          />
        </g>

        {/* Faint centerline — the "horizon" of a printed waveform */}
        <line
          x1={0} y1={midY} x2={w} y2={midY}
          stroke="#2A2522"
          strokeWidth={0.6}
          opacity={0.28}
        />

        {/* Ember playhead with sparks + trail */}
        {progress > 0 && progress < 1 ? (
          <g>
            <line
              x1={Math.max(0, playheadX - 46)} y1={midY}
              x2={playheadX} y2={midY}
              stroke="#ff8a3d"
              strokeWidth={1.5}
              strokeLinecap="round"
              opacity={playing ? 0.4 : 0.2}
            />
            {sparks.map((s, k) => (
              <circle
                key={k}
                cx={s.x} cy={s.y} r={s.r}
                fill="#ffcc7a"
                opacity={s.o}
              />
            ))}
            <circle
              cx={playheadX} cy={midY} r={hover || scrubbing ? 18 : 13}
              fill={`url(#${emberId})`}
              style={{ transition: "r 300ms ease-out" }}
            />
            <circle
              cx={playheadX} cy={midY} r={3.4}
              fill="#fff4d0"
              style={{ filter: "drop-shadow(0 0 5px #ffb066)" }}
            />
          </g>
        ) : null}
      </svg>

      {/* Premium transport bar — hidden entirely once the burn begins so
          only the printed waveform survives on the paper. */}
      <AnimatePresence>
        {interactive && !compact ? (
          <motion.div
            key="transport"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 flex flex-col items-stretch gap-3"
          >
            {/* Time strip directly under the waveform: elapsed left, total right. */}
            <div className="flex items-center justify-between text-[11px] font-medium tabular-nums tracking-[0.14em] text-black/55">
              <span>{fmtTime(current)}</span>
              <span className="text-black/45">{fmtTime(duration)}</span>
            </div>

            {/* Controls — centered beneath the timing strip. */}
            <div className="flex items-center justify-center gap-5">
              <TransportButton
                aria-label="Back 10 seconds"
                onClick={() => skip(-10)}
                size="sm"
              >
                <SkipBack className="h-4 w-4" strokeWidth={2.2} />
              </TransportButton>

              <TransportButton
                aria-label={playing ? "Pause" : "Play"}
                aria-pressed={playing}
                onClick={toggle}
                size="lg"
                primary
              >
                <AnimatePresence initial={false} mode="wait">
                  {playing ? (
                    <motion.span
                      key="pause"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="grid place-items-center"
                    >
                      <Pause className="h-5 w-5" strokeWidth={2.2} fill="currentColor" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="play"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="grid place-items-center"
                    >
                      <Play className="h-5 w-5 translate-x-[1px]" strokeWidth={2.2} fill="currentColor" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </TransportButton>

              <TransportButton
                aria-label="Forward 10 seconds"
                onClick={() => skip(10)}
                size="sm"
              >
                <SkipForward className="h-4 w-4" strokeWidth={2.2} />
              </TransportButton>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}


/* ------------------------------------------------------------ */
/* TransportButton — warm bronze, printed-onto-paper feel        */
/* ------------------------------------------------------------ */

function TransportButton({
  children,
  onClick,
  size = "sm",
  primary = false,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  size?: "sm" | "lg";
  primary?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const dim = size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const base =
    "relative grid place-items-center rounded-full border transition-all duration-200 ease-out select-none";
  // Warm bronze / parchment aesthetic — no flat modern player look.
  const secondary =
    "border-[oklch(0.42_0.05_50_/_0.55)] bg-[linear-gradient(180deg,oklch(0.86_0.05_75_/_0.9),oklch(0.72_0.06_60_/_0.85))] text-[oklch(0.28_0.06_35)] shadow-[0_1px_0_oklch(0.98_0.02_85_/_.7)_inset,0_-1px_0_oklch(0.4_0.06_40_/_.35)_inset,0_6px_18px_-10px_rgba(60,30,10,0.55)] hover:-translate-y-[1px] hover:shadow-[0_1px_0_oklch(0.98_0.02_85_/_.75)_inset,0_-1px_0_oklch(0.4_0.06_40_/_.4)_inset,0_10px_24px_-10px_rgba(60,30,10,0.6)] active:translate-y-0 active:shadow-[0_1px_0_oklch(0.4_0.06_40_/_.5)_inset]";
  const primaryCls =
    "border-[oklch(0.38_0.14_45_/_0.9)] bg-[radial-gradient(ellipse_at_30%_25%,oklch(0.9_0.15_75)_0%,oklch(0.72_0.19_45)_45%,oklch(0.5_0.16_35)_100%)] text-[oklch(0.98_0.03_85)] shadow-[0_1px_0_oklch(1_0.05_85_/_.6)_inset,0_-2px_0_oklch(0.3_0.12_35_/_.55)_inset,0_10px_26px_-8px_oklch(0.55_0.2_40_/_0.65),0_0_0_1px_oklch(0.3_0.12_35_/_.35)] hover:-translate-y-[2px] hover:shadow-[0_1px_0_oklch(1_0.05_85_/_.7)_inset,0_-2px_0_oklch(0.3_0.12_35_/_.55)_inset,0_16px_36px_-8px_oklch(0.6_0.22_45_/_0.75),0_0_0_1px_oklch(0.3_0.12_35_/_.4)] active:translate-y-0";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${dim} ${primary ? primaryCls : secondary}`}
      {...rest}
    >
      {/* Soft warm halo behind primary — the "printed glow". */}
      {primary ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-3 -z-10 rounded-full blur-xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.75 0.22 55 / 0.35) 0%, transparent 65%)",
          }}
        />
      ) : null}
      {children}
    </button>
  );
}



