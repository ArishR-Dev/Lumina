// Cinematic HUD overlay: title, prompt, skip / mute / exit controls, and
// the closing caption. Kept intentionally minimal — the scene should
// dominate. Uses framer-motion for tone-matching transitions.

import { AnimatePresence, motion, useMotionValue, useAnimationFrame } from "framer-motion";
import { ArrowLeft, VolumeX, Volume2, FastForward } from "lucide-react";
import { RITUALS, type RitualId } from "@/lib/farewell/copy";
import type { Beat } from "@/lib/farewell/director";
import type { MutableRefObject } from "react";

export type CinematicUIProps = {
  ritual: RitualId;
  beat: Beat;
  /** Live progress ref (0..1 within current beat) — read via motion values. */
  tRef: MutableRefObject<number>;
  pastPointOfNoReturn: boolean;
  muted: boolean;
  /** True while the MatchFire ignition animation is running between
   *  "Release" tap and the start of the paper burn. Hides the invitation
   *  copy/button so the ritual reads as one continuous gesture. */
  matchActive?: boolean;
  onProceed: () => void;
  onSkip: () => void;
  onExit: () => void;
  onMuteToggle: () => void;
};

export function CinematicUI(p: CinematicUIProps) {
  const copy = RITUALS[p.ritual];
  const showInvitation = p.beat === "invitation" && !p.matchActive;
  const showContemplation = p.beat === "contemplation" || p.beat === "arrival";
  const showClosing = p.beat === "stillness" || p.beat === "return";

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex flex-col text-white">
      {/* Top HUD row */}
      <div
        className="pointer-events-auto flex items-center gap-2 px-4 pt-4 sm:px-8 sm:pt-6"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 16px)" }}
      >
        {!p.pastPointOfNoReturn && (
          <button
            onClick={p.onExit}
            aria-label="Leave farewell"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-white/85 backdrop-blur transition hover:bg-white/16"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={p.onMuteToggle}
            aria-label={p.muted ? "Unmute" : "Mute"}
            aria-pressed={p.muted}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-white/85 backdrop-blur transition hover:bg-white/16"
          >
            {p.muted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
          </button>
          {p.beat !== "stillness" && p.beat !== "return" && (
            <button
              onClick={p.onSkip}
              aria-label="Skip to the end"
              className="pointer-events-auto grid h-10 place-items-center gap-1 rounded-full bg-white/8 px-3 text-xs uppercase tracking-widest text-white/85 backdrop-blur transition hover:bg-white/16 sm:h-10 sm:px-4"
            >
              <span className="inline-flex items-center gap-2">
                <FastForward className="h-4 w-4" />
                <span className="hidden sm:inline">Skip</span>
              </span>
            </button>
          )}
        </div>
      </div>




      {/* Bottom copy zone */}
      <div className="mt-auto pb-10 sm:pb-16" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 40px)" }}>
        <div className="mx-auto max-w-lg px-6 text-center">
          <AnimatePresence mode="wait">
            {showContemplation && (
              <motion.div
                key="contemplation"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                className="font-hand text-2xl italic text-white/70"
              >
                Take a moment.
              </motion.div>
            )}

            {showInvitation && (
              <motion.div
                key="invitation"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center gap-6"
              >
                <p className="max-w-md font-display text-2xl leading-snug tracking-wide text-white/90 sm:text-3xl">
                  {copy.invitation}
                </p>
                <button
                  onClick={p.onProceed}
                  className="pointer-events-auto rounded-full bg-gradient-to-b from-[oklch(0.82_0.15_60)] to-[oklch(0.55_0.18_28)] px-8 py-3 text-sm font-medium uppercase tracking-[0.24em] text-black/85 shadow-[0_0_60px_-8px_oklch(0.7_0.2_45)] transition hover:brightness-110 active:scale-[0.98]"
                >
                  {copy.invitationCta}
                </button>
                <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">
                  This cannot be undone from here.
                </p>
              </motion.div>
            )}

            {p.beat === "transformation" && (
              <TransformationCaption tRef={p.tRef} text={copy.transformation} />
            )}

            {showClosing && (
              <motion.p
                key="closing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.2, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="font-display text-2xl leading-relaxed text-white/90 sm:text-3xl"
              >
                {copy.closing}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// Transformation-beat caption whose opacity is driven directly from the
// director's tRef via a framer-motion motion value. This keeps the RAF
// updates OUT of React state — the parent never re-renders for the fade.
function TransformationCaption({ tRef, text }: { tRef: MutableRefObject<number>; text: string }) {
  const opacity = useMotionValue(1);
  useAnimationFrame(() => {
    opacity.set(1 - Math.min(1, tRef.current * 1.4));
  });
  return (
    <motion.div
      key="transformation"
      initial={{ opacity: 0 }}
      style={{ opacity }}
      exit={{ opacity: 0 }}
      className="font-hand text-lg italic text-white/50"
    >
      {text}
    </motion.div>
  );
}
