// FarewellScene — the orchestrator. Owns the ritual director, the audio
// graph, haptics, and the commit-to-ashes side-effect. Renders the
// StandardModeScene (the only farewell renderer) with the CinematicUI
// overlay above it.
//
// IMPORTANT: This component MUST NOT re-render on every RAF frame. The
// director exposes `tRef` (mutable) and `subscribe` for frame-level work;
// only beat transitions push new React state through here.

import { AnimatePresence, motion, useMotionValue, useAnimationFrame } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BEATS, useDirector, type Beat, type BeatSpec, type FrameListener } from "@/lib/farewell/director";
import { startFireAudio, type FireAudio } from "@/lib/farewell/audio";
import { haptic, setHapticsEnabled } from "@/lib/farewell/haptics";
import { CinematicUI } from "@/components/farewell/CinematicUI";
import { StandardModeScene } from "@/components/farewell/StandardModeScene";
import { MatchFireOverlay } from "@/components/farewell/MatchFireOverlay";


import { useAshes } from "@/lib/farewell/ashes";
import type { RitualId } from "@/lib/farewell/copy";
import {
  ENTITY_META,
  useDeleteEntity,
  useEntitySnapshot,
  type EntityKind,
} from "@/lib/farewell/entities";
import { deleteVoice, loadVoice } from "@/lib/farewell/voice";
import { computeVoicePeaks, type VoicePeaks } from "@/lib/farewell/waveform";
import { softPause, softPlay, type VoiceController } from "@/lib/farewell/voice-transport";

export type FarewellSceneProps = {
  entityKind: EntityKind;
  entityId: string;
  ritual: RitualId; // M1: always "fire"
  onExit: () => void;
};

export function FarewellScene({ entityKind, entityId, ritual, onExit }: FarewellSceneProps) {
  // On phones/tablets the paper must remain perfectly centered and
  // stationary throughout the ritual — no camera drift, no idle sway,
  // no ignition-scale pulse. Desktop keeps its current motion.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  const snapshot = useEntitySnapshot(entityKind, entityId);
  const deleteEntity = useDeleteEntity();
  const release = useAshes((s) => s.release);

  const [muted, setMuted] = useState(false);
  // MatchFire runs between the user's "Release" tap and the start of the
  // existing paper burn. While true, we withhold `director.proceed()` so
  // the transformation beat (and audio.ignite) fire only on match onComplete.
  const [matchActive, setMatchActive] = useState(false);
  const [cameraPulse, setCameraPulse] = useState(false);
  const audioRef = useRef<FireAudio | null>(null);
  const committedRef = useRef(false);
  const matchCompletedRef = useRef(false);
  const finishedRef = useRef(false);
  const exitedRef = useRef(false);
  // Pending timeouts so we can cancel them if the component unmounts
  // before they fire (avoids state-update-after-unmount warnings).
  const pendingTimeoutsRef = useRef<Set<number>>(new Set());
  const scheduleTimeout = (fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      pendingTimeoutsRef.current.delete(id);
      fn();
    }, ms);
    pendingTimeoutsRef.current.add(id);
    return id;
  };
  useEffect(() => {
    const pending = pendingTimeoutsRef.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
    };
  }, []);
  
  const ritualSnapRef = useRef(snapshot ?? null);
  // Locks preview transport once the user commits to the flame. After
  // this flips, the VoiceController rejects every request from
  // StandardModeScene — the ritual is the only voice caller from here on.
  const matchLockRef = useRef(false);
  const mutedRef = useRef(false);

  // Live ignition point in paper-uv space. MatchFire updates it as the
  // flame moves along the paper edge so the burn originates exactly
  // where the flame touched. Defaults to a bottom-edge point so a
  // mid-air paper still burns from the edge if the overlay never runs.
  const burnOriginRef = useRef<{ u: number; v: number } | null>({ u: 0.5, v: 0.02 });
  // Rendered paper element — StandardModeScene attaches the DOM node here
  // so MatchFireOverlay can size its travel rectangle to the actual paper
  // bounding box on mobile (paper is stationary; match starts / ends just
  // outside the paper edges).
  const paperElRef = useRef<HTMLDivElement | null>(null);

  // Optional spoken message attached to this memory. Loaded once at mount.
  // Played automatically when the "transformation" beat starts, then
  // gently faded out as the paper's burn resolves so the voice
  // disappears with the ashes.
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const voiceStartedRef = useRef(false);
  const [voicePeaks, setVoicePeaks] = useState<VoicePeaks | null>(null);
  const [hasVoice, setHasVoice] = useState(false);
  const [voiceDuration, setVoiceDuration] = useState(0);
  useEffect(() => {
    const rec = loadVoice(entityKind, entityId);
    if (!rec) {
      setHasVoice(false);
      setVoicePeaks(null);
      setVoiceDuration(0);
      return;
    }
    setHasVoice(true);
    setVoiceDuration(isFinite(rec.duration) && rec.duration > 0 ? rec.duration : 0);
    const a = new Audio(rec.dataUrl);
    a.preload = "auto";
    a.loop = false; // playback must happen exactly once
    a.volume = 0;
    voiceRef.current = a;
    let alive = true;
    const reconcileDuration = () => {
      if (a.readyState < 1) return;
      const d = isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
      if (d > 0) setVoiceDuration(d);
    };
    a.addEventListener("loadedmetadata", reconcileDuration);
    a.addEventListener("durationchange", reconcileDuration);
    a.addEventListener("canplay", reconcileDuration);
    a.addEventListener("canplaythrough", reconcileDuration);
    const onError = () => {
      // eslint-disable-next-line no-console
      console.error("[audio] error", {
        error: a.error, code: a.error?.code, message: a.error?.message,
        networkState: a.networkState, readyState: a.readyState,
      });
    };
    a.addEventListener("error", onError);
    if (a.readyState >= 1) reconcileDuration();
    computeVoicePeaks(rec.dataUrl).then((p) => {
      if (!alive) return;
      setVoicePeaks(p);
    });

    return () => {
      alive = false;
      a.removeEventListener("loadedmetadata", reconcileDuration);
      a.removeEventListener("durationchange", reconcileDuration);
      a.removeEventListener("canplay", reconcileDuration);
      a.removeEventListener("canplaythrough", reconcileDuration);
      a.removeEventListener("error", onError);
      try { a.pause(); } catch { /* ignore */ }
      a.src = "";
      voiceRef.current = null;
      voiceStartedRef.current = false;
    };
  }, [entityKind, entityId]);
  useEffect(() => {
    mutedRef.current = muted;
    if (voiceRef.current) voiceRef.current.muted = muted;
  }, [muted]);

  // Sole voice controller. StandardModeScene / Waveform NEVER mutate
  // the audio element directly — they call these callbacks and this
  // component executes the mutation (or rejects it once the ritual
  // has begun). One owner, one caller, zero races.
  const voiceController = useMemo<VoiceController>(() => ({
    requestPlay: () => {
      const a = voiceRef.current;
      if (matchLockRef.current || !a) return;
      softPlay(a, mutedRef.current ? 0 : 0.9, 500);
    },
    requestPause: () => {
      const a = voiceRef.current;
      if (matchLockRef.current || !a) return;
      softPause(a, 400);
    },
    requestSeek: (time: number) => {
      const a = voiceRef.current;
      if (matchLockRef.current || !a) return;
      const d = isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
      const clamped = d > 0
        ? Math.max(0, Math.min(d - 0.001, time))
        : Math.max(0, time);
      a.currentTime = clamped;
    },
    requestReplay: () => {
      const a = voiceRef.current;
      if (matchLockRef.current || !a) return;
      a.currentTime = 0;
      softPlay(a, mutedRef.current ? 0 : 0.9, 500);
    },
    isLocked: () => matchLockRef.current,
  }), []);

  if (!ritualSnapRef.current && snapshot) {
    ritualSnapRef.current = snapshot;
  }

  const ritualSnap = ritualSnapRef.current;

  useEffect(() => {
    const touch = typeof window !== "undefined"
      && window.matchMedia?.("(pointer: coarse)").matches;
    setHapticsEnabled(!!touch);
  }, []);

  useEffect(() => {
    let disposed = false;
    startFireAudio().then((a) => {
      if (disposed) { a?.dispose(); return; }
      audioRef.current = a;
      a?.setIntensity(0);
    });
    return () => {
      disposed = true;
      audioRef.current?.fadeOut(700).then(() => audioRef.current?.dispose());
      audioRef.current = null;
    };
  }, []);

  useEffect(() => { audioRef.current?.setMuted(muted); }, [muted]);

  // Voice-aware director beats. When a recording is attached, the
  // transformation beat is tuned so the final ash lands roughly one
  // second after the voice ends. Very short recordings keep a ritualistic
  // floor; very long recordings extend the burn instead of getting cut.
  const beats = useMemo<BeatSpec[]>(() => {
    const rec = typeof window !== "undefined" ? loadVoice(entityKind, entityId) : null;
    const voiceMs = rec && isFinite(rec.duration) ? Math.max(0, rec.duration * 1000) : 0;
    if (voiceMs <= 0) return DEFAULT_BEATS;
    // Burn ends ~1.2s after the last spoken word; floor keeps short
    // recordings from feeling rushed, ceiling caps very long clips.
    const transformation = Math.min(90_000, Math.max(16_000, voiceMs + 2200));
    return DEFAULT_BEATS.map((b) =>
      b.name === "transformation" ? { ...b, duration: transformation } : b,
    );
  }, [entityKind, entityId]);

  const director = useDirector({
    beats,
    onEnter: (b) => {
      if (b === "transformation") {
        haptic("ignite");
        audioRef.current?.ignite();
        // Voice is a keepsake printed on the paper as a waveform — it
        // is intentionally NOT played back during the burn. The paper
        // burns in silence.
        voiceStartedRef.current = true;
      }
      if (b === "stillness") haptic("settle");
      if (b === "return") haptic("end");
    },
    onCommit: () => {
      if (committedRef.current || !ritualSnap) return;
      committedRef.current = true;
      haptic("commit");
      release({
        entityType: entityKind,
        entityId,
        ritual,
        snapshot: { title: ritualSnap.title, content: ritualSnap.content },
      });
      deleteEntity(entityKind, entityId);
      // The recording is part of the memory — release it with the ashes.
      deleteVoice(entityKind, entityId);
    },
    onFinished: () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      // Hold complete silence for ~2.6s after the last ember so the user
      // can sit with the moment before the return transition.
      scheduleTimeout(() => {
        if (exitedRef.current) return;
        exitedRef.current = true;
        onExit();
      }, 2600);
    },
    onExitEarly: () => {
      if (exitedRef.current) return;
      exitedRef.current = true;
      onExit();
    },
  });


  // Per-frame flame intensity — computed from the director's tRef, pushed
  // straight into the audio engine. No React state.
  const { subscribe: directorSubscribe, tRef } = director;
  useEffect(() => {
    let lastV = -1;
    const listener: FrameListener = (t, _elapsed, beat) => {
      // Pre-ignition beats produce a per-beat constant, so recomputing and
      // pushing into the audio engine every rAF is wasted work. Compute
      // cheaply, only call setIntensity when the value actually changed.
      let v = 0;
      if (beat === "arrival") v = 0.02;
      else if (beat === "contemplation") v = 0.04;
      else if (beat === "invitation") v = 0.06;
      else if (beat === "transformation") {
        const p = t;
        if (p < 0.10)      v = (p / 0.10) * 0.14;
        else if (p < 0.30) v = 0.14 + ((p - 0.10) / 0.20) * 0.36;
        else if (p < 0.70) v = 0.50 + ((p - 0.30) / 0.40) * 0.50;
        else if (p < 0.88) v = Math.max(0.55, 1.0 - (p - 0.70) * 1.2);
        else               v = Math.max(0.06, 0.78 - (p - 0.88) * 5.5);
      } else if (beat === "stillness") {
        v = Math.max(0, 0.25 - t * 0.25);
      }
      if (v !== lastV) {
        audioRef.current?.setIntensity(v);
        lastV = v;
      }

      // Voice memory is never played during the burn — ensure the
      // element stays paused and silent once the flame ignites.
      // Pre-ignition beats (arrival / contemplation / invitation) leave
      // the preview transport untouched so the user can play / pause /
      // seek freely before releasing to the flame.
      if (beat === "transformation" || beat === "stillness") {
        const voice = voiceRef.current;
        if (voice) {
          voice.volume = 0;
          if (!voice.paused) {
            try { voice.pause(); } catch { /* ignore */ }
          }
        }
      }
    };
    return directorSubscribe(listener);
  }, [directorSubscribe, muted]);

  const handleProceed = () => {
    // New flow: Release → MatchFire animation → (onComplete) → existing
    // Lumina burn. Guarded so a repeated press cannot restart the ritual.
    if (matchActive || matchCompletedRef.current) return;
    // Lock the preview transport BEFORE anything else — from this
    // instant, the VoiceController rejects every request from the paper
    // UI so the ritual is the only voice caller.
    matchLockRef.current = true;
    // If the preview was playing (or paused mid-track), silence it and
    // rewind so the ritual gets a clean start when `onEnter` fires.
    const v = voiceRef.current;
    if (v) {
      try { v.pause(); } catch { /* ignore */ }
      v.currentTime = 0;
      v.volume = 0;
    }
    voiceStartedRef.current = false;
    setMatchActive(true);
    void audioRef.current?.resume();
  };

  const handleMatchStart = () => {
    // Short scratchy strike sound the moment the match ignites — the
    // "small crackle" that precedes the paper's larger ignition.
    audioRef.current?.strike();
  };

  const handleMatchComplete = () => {
    // Idempotent — a duplicate onComplete from MatchFireOverlay must never
    // re-advance the director or restart the ritual.
    if (matchCompletedRef.current) return;
    matchCompletedRef.current = true;
    // Tiny camera nudge (scale 1 → 1.008 → 1) at ignition.
    setCameraPulse(true);
    scheduleTimeout(() => setCameraPulse(false), 520);
    // Advance the director — this fires audio.ignite() and starts the
    // paper burn shader. The 120ms ember pause is already applied inside
    // the overlay's onComplete callback.
    director.proceed();
    // Let the afterglow linger briefly after the paper starts burning.
    scheduleTimeout(() => setMatchActive(false), 900);
  };


  // Failsafe — exit if the underlying entity vanishes mid-ritual.
  useEffect(() => {
    if (!ritualSnap && !committedRef.current && director.beat !== "arrival" && director.beat !== "contemplation") {
      if (exitedRef.current) return;
      exitedRef.current = true;
      onExit();
    }
  }, [ritualSnap, director.beat, onExit]);


  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-[60] overflow-hidden bg-black text-white"
      style={{ touchAction: "none" }}
    >
      <ReturnCurtain beat={director.beat} tRef={tRef} />

      {/* Camera-response wrapper.
          - Idle: a very slow breathing zoom + horizontal parallax drift
            during pre-ignition beats (arrival / contemplation / invitation).
          - Ignition: tiny 1 → 1.008 → 1 pulse the moment the match completes.
          Text stays crisp because the HUD is outside this wrapper. */}
      <motion.div
        className="absolute inset-0"
        animate={
          isMobile
            ? {
                scale: 1,
                x: 0,
                filter: matchActive ? "brightness(0.92)" : "brightness(1)",
              }
            : cameraPulse
              ? { scale: 1.012, x: 0, filter: "brightness(1)" }
              : matchActive
                ? { scale: 1.02, x: 0, filter: "brightness(0.92)" }
                : (director.beat === "arrival" ||
                   director.beat === "contemplation" ||
                   director.beat === "invitation")
                  ? { scale: [1, 1.012, 1], x: [0, 4, -3, 0], filter: "brightness(1)" }
                  : { scale: 1, x: 0, filter: "brightness(1)" }
        }
        transition={
          isMobile
            ? { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
            : cameraPulse
              ? { duration: 0.52, ease: [0.22, 1, 0.36, 1] }
              : matchActive
                ? { duration: 0.85, ease: [0.22, 1, 0.36, 1] }
                : { duration: 18, repeat: Infinity, ease: "easeInOut" }
        }
        style={{ transformOrigin: "50% 55%" }}
      >
        {(() => {
          const rawTitle = ritualSnap?.title ?? "";
          const rawContent = ritualSnap?.content ?? "";
          const voiceOnly =
            hasVoice && rawTitle.trim().length === 0 && rawContent.trim().length === 0;
          const paperTitle = voiceOnly
            ? "A Spoken Farewell"
            : (rawTitle || "Untitled");
          const paperContent = voiceOnly ? "" : contentPreview(rawContent);
          const sharedProps = {
            title: paperTitle,
            content: paperContent,
            beat: director.beat,
            tRef,
            burnOriginRef,
            paperElRef,
            voicePeaks,
            voiceOnly,
            voiceRef,
            voiceController,
            voiceDuration,
            transportLocked: matchActive,
          };
          return <StandardModeScene {...sharedProps} />;
        })()}
      </motion.div>

      <CinematicUI
        ritual={ritual}
        beat={director.beat}
        tRef={tRef}
        pastPointOfNoReturn={director.pastPointOfNoReturn}
        muted={muted}
        matchActive={matchActive}
        onProceed={handleProceed}
        onSkip={director.skip}
        onExit={() => { director.exit(); }}
        onMuteToggle={() => setMuted((m) => !m)}
      />


      <MatchFireOverlay
        active={matchActive}
        edge="bottom"
        duration={2000}
        burnDelay={120}
        paperElRef={paperElRef}
        onStart={handleMatchStart}
        onBurnUv={(uv) => {
          // Keep the burn strictly on the paper edge — clamp v to a very
          // small offset so the shader's radial heat field still has a
          // well-defined origin (v=0 exactly would touch the tearEdge).
          burnOriginRef.current = { u: uv.u, v: Math.min(0.06, Math.max(0.02, uv.v)) };
        }}
        onComplete={handleMatchComplete}
      />

    </motion.div>
  );
}


function contentPreview(html: string) {
  return html
    .replace(/<br\s*\/?>(?!\s*<br)/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The return-beat black curtain. Drives its opacity from tRef via a
// framer-motion motion value so the parent never re-renders per frame.
function ReturnCurtain({ beat, tRef }: { beat: Beat; tRef: React.MutableRefObject<number> }) {
  const opacity = useMotionValue(0);
  useAnimationFrame(() => {
    const target = beat === "return" ? Math.min(1, tRef.current * 1.3) : 0;
    opacity.set(target);
  });
  return (
    <AnimatePresence>
      {beat === "return" && (
        <motion.div
          initial={{ opacity: 0 }}
          style={{ opacity }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 z-[80] bg-black"
        />
      )}
    </AnimatePresence>
  );
}
