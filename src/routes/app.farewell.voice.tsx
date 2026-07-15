// Farewell — Voice Ritual.
//
// Cinematic room. The microphone is a living ember orb. Recording logic,
// MediaRecorder wiring, saveVoice/loadVoice/deleteVoice, and the <audio>
// playback element are UNCHANGED from the previous version — only the
// visual/audio experience around them is elevated here.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Flame,
  Mic,
  Square,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  Check,
} from "lucide-react";

import {
  deleteVoice,
  loadVoice,
  pickMimeType,
  saveVoice,
  type VoiceRecord,
} from "@/lib/farewell/voice";
import {
  createCustomFarewellWithId,
  readCustomFarewell,
} from "@/lib/farewell/entities";

const DRAFT_KEY = "lumina-farewell-draft-id";


function readDraftId(): string {
  if (typeof window === "undefined") return "c_pending";
  const existing = window.sessionStorage.getItem(DRAFT_KEY);
  if (existing) return existing;
  const id = "c_" + Math.random().toString(36).slice(2, 10);
  window.sessionStorage.setItem(DRAFT_KEY, id);
  return id;
}

export const Route = createFileRoute("/app/farewell/voice")({
  ssr: false,
  component: VoicePage,
});

type Phase = "idle" | "arming" | "recording" | "review";
const BINS = 64;

function VoicePage() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const draftIdRef = useRef<string>("");
  if (!draftIdRef.current) draftIdRef.current = readDraftId();
  const draftId = draftIdRef.current;

  const [voice, setVoice] = useState<VoiceRecord | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BINS).fill(0.05));
  const [amplitude, setAmplitude] = useState(0); // 0..1 overall RMS
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  // MediaRecorder + analyser refs — recording logic unchanged
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackRafRef = useRef<number | null>(null);
  const smoothedRef = useRef<Float32Array>(new Float32Array(BINS));
  const ampSmoothRef = useRef<number>(0);
  const countdownTimerRef = useRef<number | null>(null);

  // Ambience synth — one shared context
  const ambienceRef = useRef<ReturnType<typeof createAmbience> | null>(null);

  const startAmbience = useCallback(() => {
    if (!ambienceRef.current) ambienceRef.current = createAmbience();
    ambienceRef.current?.start();
  }, []);

  useEffect(() => {
    // Load existing voice on mount
    const v = loadVoice("custom", draftId);
    if (v) {
      setVoice(v);
      setPhase("review");
    }
  }, [draftId]);

  // Escape closes the ritual room (mirrors the small Back link).
  useEffect(() => {
    if (releasing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Don't cancel a live recording accidentally — stop it instead.
        if (phase === "recording") {
          e.preventDefault();
          try { recorderRef.current?.stop(); } catch { /* ignore */ }
          return;
        }
        e.preventDefault();
        navigate({ to: "/app/farewell" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, phase, releasing]);

  useEffect(() => {
    return () => {
      stopStream();
      cancelAnim();
      stopPlaybackAnim();
      if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
      ambienceRef.current?.stop();
      ambienceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }
  function cancelAnim() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  function stopPlaybackAnim() {
    if (playbackRafRef.current != null) cancelAnimationFrame(playbackRafRef.current);
    playbackRafRef.current = null;
    try { playbackCtxRef.current?.close(); } catch { /* ignore */ }
    playbackCtxRef.current = null;
    playbackAnalyserRef.current = null;
  }

  // ----- Recording (logic unchanged, only start is now behind a countdown) -----

  const actuallyStartRecording = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording isn't available in this browser.");
      setPhase("idle");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || "audio/webm" });
        const duration = (performance.now() - startedAtRef.current) / 1000;
        try {
          const saved = await saveVoice("custom", draftId, blob, duration);
          setVoice(saved);
          setPhase("review");
          ambienceRef.current?.playConfirmTone();
          haptic(18);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Could not save recording.");
          setPhase("idle");
        } finally {
          stopStream();
          cancelAnim();
        }
      };

      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.85;
      src.connect(analyser);
      analyserRef.current = analyser;

      const freq = new Uint8Array(analyser.frequencyBinCount);
      const time = new Uint8Array(analyser.fftSize);
      const smoothed = smoothedRef.current;

      const tick = () => {
        const a = analyserRef.current;
        if (!a) return;
        a.getByteFrequencyData(freq);
        a.getByteTimeDomainData(time);

        // Overall amplitude (RMS from time-domain data)
        let sum = 0;
        for (let i = 0; i < time.length; i++) {
          const v = (time[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / time.length);
        const amp = Math.min(1, rms * 3.5);
        ampSmoothRef.current += (amp - ampSmoothRef.current) * 0.18;
        setAmplitude(ampSmoothRef.current);

        // 64 smoothed bins, emphasis on lower half for vocal
        const usable = Math.floor(freq.length * 0.55);
        const step = Math.max(1, Math.floor(usable / BINS));
        for (let i = 0; i < BINS; i++) {
          const v = (freq[i * step] ?? 0) / 255;
          const target = Math.min(1, Math.max(0.04, v * 1.25));
          smoothed[i] += (target - smoothed[i]) * 0.22;
        }
        setLevels(Array.from(smoothed));
        setElapsed((performance.now() - startedAtRef.current) / 1000);
        rafRef.current = requestAnimationFrame(tick);
      };

      startedAtRef.current = performance.now();
      setElapsed(0);
      rec.start(100);
      setPhase("recording");
      ambienceRef.current?.playMicClick();
      haptic(22);
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Could not start recording.",
      );
      stopStream();
      setPhase("idle");
    }
  }, [draftId]);

  const startRecording = useCallback(() => {
    if (phase === "recording" || phase === "arming") return;
    startAmbience();
    haptic(10);
    setPhase("arming");
    setCountdown(3);
    let n = 3;
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
    // Soft inhale tone at start of countdown
    ambienceRef.current?.playInhale();
    countdownTimerRef.current = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCountdown(n);
        ambienceRef.current?.playTick();
        haptic(8);
      } else {
        window.clearInterval(countdownTimerRef.current!);
        countdownTimerRef.current = null;
        setCountdown(null);
        void actuallyStartRecording();
      }
    }, 1000);
  }, [phase, startAmbience, actuallyStartRecording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const remove = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    stopPlaybackAnim();
    deleteVoice("custom", draftId);
    setVoice(null);
    setPlaying(false);
    setCurrentTime(0);
    smoothedRef.current.fill(0.05);
    setLevels(Array(BINS).fill(0.05));
    setAmplitude(0);
    setPhase("idle");
    haptic(12);
  }, [draftId]);

  // ----- Playback (logic unchanged) -----
  useEffect(() => {
    if (!voice) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.src = voice.dataUrl;
    a.crossOrigin = "anonymous";
    a.preload = "metadata";
    a.loop = false;
    const onTime = () => setCurrentTime(a.currentTime);
    const onEnd = () => {
      setPlaying(false); setCurrentTime(0); stopPlaybackAnim();
      smoothedRef.current.fill(0.05);
      setLevels(Array(BINS).fill(0.05));
      setAmplitude(0);
    };
    const onPause = () => { setPlaying(false); stopPlaybackAnim(); };
    const onPlay = () => {
      setPlaying(true);
      ambienceRef.current?.playVinylClick();
      try {
        const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        if (!playbackCtxRef.current) {
          const ctx = new AC();
          playbackCtxRef.current = ctx;
          const src = ctx.createMediaElementSource(a);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.85;
          src.connect(analyser);
          analyser.connect(ctx.destination);
          playbackAnalyserRef.current = analyser;
        }
        const freq = new Uint8Array(playbackAnalyserRef.current!.frequencyBinCount);
        const time = new Uint8Array(playbackAnalyserRef.current!.fftSize);
        const smoothed = smoothedRef.current;
        const tick = () => {
          const an = playbackAnalyserRef.current;
          if (!an) return;
          an.getByteFrequencyData(freq);
          an.getByteTimeDomainData(time);
          let sum = 0;
          for (let i = 0; i < time.length; i++) {
            const v = (time[i] - 128) / 128;
            sum += v * v;
          }
          const amp = Math.min(1, Math.sqrt(sum / time.length) * 3.0);
          ampSmoothRef.current += (amp - ampSmoothRef.current) * 0.15;
          setAmplitude(ampSmoothRef.current);
          const usable = Math.floor(freq.length * 0.55);
          const step = Math.max(1, Math.floor(usable / BINS));
          for (let i = 0; i < BINS; i++) {
            const v = (freq[i * step] ?? 0) / 255;
            const target = Math.min(1, Math.max(0.04, v * 1.25));
            smoothed[i] += (target - smoothed[i]) * 0.2;
          }
          setLevels(Array.from(smoothed));
          playbackRafRef.current = requestAnimationFrame(tick);
        };
        playbackRafRef.current = requestAnimationFrame(tick);
      } catch { /* ignore */ }
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("pause", onPause);
    a.addEventListener("play", onPlay);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("play", onPlay);
    };
  }, [voice]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    startAmbience();
    if (a.paused) void a.play(); else a.pause();
    haptic(10);
  };

  const duration = voice?.duration || audioRef.current?.duration || 0;

  const onUseThisVoice = () => {
    if (releasing) return;
    setReleasing(true);
    haptic(28);
    // Fully stop any in-page playback — the ritual scene owns audio from
    // here. Cancel the analyser RAF so no state updates race the nav.
    try {
      const a = audioRef.current;
      if (a) { a.pause(); a.currentTime = 0; }
    } catch { /* ignore */ }
    stopPlaybackAnim();
    // Attach the recording to a farewell draft (voice-only: empty title +
    // empty content — the scene detects this and renders the dedicated
    // Voice Farewell paper). Then jump straight into the burn cinematic.
    const existing = readCustomFarewell(draftId);
    if (!existing) createCustomFarewellWithId(draftId, "", "");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DRAFT_KEY);
    }
    window.setTimeout(() => {
      navigate({
        to: "/app/farewell/$entity/$id",
        params: { entity: "custom", id: draftId },
        search: { ritual: "fire" },
      });
    }, 1400);
  };


  return (
    <div
      className="fixed inset-0 z-40 overflow-hidden bg-[#06040a] text-white"
      style={{ touchAction: "manipulation" }}
      onPointerDown={startAmbience}
    >
      {/* Deep atmospheric backdrop */}
      <FogLayer />
      <LightRays />
      <CandleGlow warmth={phase === "recording" ? 1 : 0} flicker />
      <DustParticles reduced={!!reduced} />
      <SmokeDrift />
      <Embers reduced={!!reduced} />
      <Vignette />

      {/* Top bar — safe-area-inset-top padding so the ritual title never
          sits under the status bar / browser chrome on mobile. Desktop
          keeps its original padding. */}
      <div
        className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] sm:px-6 sm:py-4"
      >
        <Link
          to="/app/farewell"
          aria-label="Back to Farewell"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 py-2 text-[11px] uppercase tracking-[0.28em] text-white/45 transition hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <div className="text-[10px] uppercase tracking-[0.32em] text-white/60">
          A Quiet Ritual
        </div>
        <div className="w-10" />
      </div>

      <motion.div
        animate={releasing ? { scale: 1.08, opacity: 0.85, filter: "brightness(0.75)" } : { scale: 1, opacity: 1, filter: "brightness(1)" }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-[1] flex h-full w-full flex-col items-center justify-start overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-[calc(env(safe-area-inset-top,0px)+72px)] sm:justify-center sm:pb-20 sm:pt-20"
        style={{ transformOrigin: "50% 50%" }}
      >

        <div className="flex w-full max-w-xl flex-col items-center">

          {/* Whisper prompt — tightened top margin on mobile so it sits
              a stable distance from the top bar and doesn't overlap it
              on shorter screens. Desktop spacing is unchanged. */}
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: releasing ? 0 : 1, y: 0 }}
            transition={{ duration: 1.1, delay: releasing ? 0 : 0.15 }}
            className="mb-6 max-w-[22ch] text-center font-display text-[15px] italic leading-snug text-white/60 sm:mb-10 sm:max-w-none sm:text-[16px]"
          >
            {phase === "idle" && "Speak what you're ready to let go."}
            {phase === "arming" && "Breathe in. The room is opening."}
            {phase === "recording" && "The room is listening."}
            {phase === "review" && "Sit with it once more before we let it go."}
          </motion.p>


          {/* Living orb centerpiece */}
          <MicOrb
            phase={phase}
            countdown={countdown}
            levels={levels}
            amplitude={amplitude}
            elapsed={elapsed}
            currentTime={currentTime}
            duration={duration}
            playing={playing}
            onStart={startRecording}
            onStop={stopRecording}
            onTogglePlay={togglePlay}
            releasing={releasing}
          />

          {/* Stable-height slot: keeps the orb's vertical position constant
              across Recording / Listening / Replay / Completed on mobile.
              Desktop stays untouched (min-h-0). */}
          <div className="mt-2 flex w-full flex-col items-center min-h-[260px] sm:mt-0 sm:min-h-0">

            {/* Captured chip + actions */}
            <AnimatePresence>
              {phase === "review" && !releasing && (
                <motion.div
                  key="captured"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.6 }}
                  className="mt-6 flex flex-col items-center gap-4 sm:mt-10 sm:gap-5"
                >
                  <div
                    className="flex items-center gap-2 rounded-full border border-[oklch(0.55_0.16_55_/_.35)] bg-[oklch(0.28_0.08_35_/_.5)] px-4 py-1.5 text-[11px] uppercase tracking-[0.28em] text-[oklch(0.9_0.12_65)] backdrop-blur-sm"
                    style={{
                      boxShadow: "0 0 24px oklch(0.7 0.22 45 / .25), inset 0 0 12px oklch(0.7 0.22 45 / .15)",
                    }}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Voice Memory Captured
                    <span className="ml-2 text-white/50 tabular-nums normal-case tracking-normal">
                      {fmt(duration)}
                    </span>
                  </div>

                  {/* Primary review actions — Record Again and Replay stay
                      side-by-side. Delete moves onto its own row below the
                      main CTA so it never sits next to "Use This Voice"
                      and reads as destructive-primary on narrow phones. */}
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap sm:gap-3">
                    <GhostAction onClick={startRecording} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                      Record Again
                    </GhostAction>
                    <GhostAction onClick={togglePlay} icon={playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}>
                      {playing ? "Pause" : "Replay"}
                    </GhostAction>
                  </div>

                  <UseThisVoiceButton onClick={onUseThisVoice} />

                  <GhostAction onClick={remove} icon={<Trash2 className="h-3.5 w-3.5 text-[oklch(0.75_0.18_25)]" />}>
                    Delete
                  </GhostAction>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Idle/arming/recording hints */}
            {phase !== "review" && (
              <motion.p
                initial={false}
                animate={{ opacity: releasing ? 0 : 1 }}
                transition={{ duration: 0.5 }}
                className="mt-6 text-[11px] uppercase tracking-[0.32em] text-white/35 sm:mt-10"
              >
                {phase === "idle" && "Tap the orb to begin"}
                {phase === "arming" && "Breathe…"}
                {phase === "recording" && "Tap the orb to close"}
              </motion.p>
            )}

            {error && (
              <div className="mt-5 rounded-xl border border-[oklch(0.5_0.14_35_/_.5)] bg-[oklch(0.2_0.05_30_/_.5)] px-4 py-2.5 text-[12px] text-[oklch(0.88_0.1_45)]">
                {error}
              </div>
            )}

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: releasing ? 0 : 1 }}
              transition={{ duration: 0.6 }}
              className="mt-6 max-w-sm px-2 text-center text-[11px] leading-relaxed text-white/60"
            >
              Nothing is saved to your memories. The recording lives only for this ritual.
            </motion.p>
          </div>

        </div>
      </motion.div>

      {/* Fade-to-black + ember transition on "Use This Voice" */}
      <AnimatePresence>
        {releasing && (
          <>
            <motion.div
              key="curtain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, delay: 0.25 }}
              className="pointer-events-none absolute inset-0 z-20 bg-black"
            />
            <motion.div
              key="ember"
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{
                opacity: [0, 1, 1, 0.7, 0],
                scale: [0.3, 1, 0.9, 0.5, 0.1],
                y: [0, -8, -18, -40, -80],
              }}
              transition={{ duration: 1.8, ease: "easeOut", times: [0, 0.25, 0.5, 0.8, 1] }}
              className="pointer-events-none absolute left-1/2 top-1/2 z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, oklch(0.95 0.2 70) 0%, oklch(0.72 0.24 40) 55%, transparent 100%)",
                boxShadow:
                  "0 0 40px 14px oklch(0.75 0.22 40 / .7), 0 0 100px 30px oklch(0.7 0.22 35 / .4)",
              }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------------------------------------- */
/* Mic orb — living centerpiece                                     */
/* --------------------------------------------------------------- */

function MicOrb({
  phase,
  countdown,
  levels,
  amplitude,
  elapsed,
  currentTime,
  duration,
  playing,
  onStart,
  onStop,
  onTogglePlay,
  releasing,
}: {
  phase: Phase;
  countdown: number | null;
  levels: number[];
  amplitude: number;
  elapsed: number;
  currentTime: number;
  duration: number;
  playing: boolean;
  onStart: () => void;
  onStop: () => void;
  onTogglePlay: () => void;
  releasing: boolean;
}) {
  // Responsive orb sizing — on desktop stays 340; on mobile scales down
  // to fit within the viewport width with side padding so the orb and
  // its glow are never clipped. All internal ratios are derived from
  // `size` so waveform paths, button, and halos scale together.
  const [size, setSize] = useState(340);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const compute = () => {
      const w = window.innerWidth;
      // Desktop keeps 340; mobile fits within viewport minus safe gutters.
      const next = w >= 640 ? 340 : Math.max(260, Math.min(340, w - 48));
      setSize(next);
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);
  const c = size / 2;
  const baseR = (size * 96) / 340; // preserve original ratio
  const active = phase === "recording" || playing;
  // Amplitude drives ambient bloom
  const amp = Math.min(1, amplitude * 1.6 + (active ? 0.15 : 0));
  const bloom = 0.5 + amp * 0.9;


  const onClick = () => {
    if (releasing || phase === "arming") return;
    if (phase === "idle") onStart();
    else if (phase === "recording") onStop();
    else onTogglePlay();
  };

  const ariaLabel =
    phase === "idle" ? "Start recording" :
    phase === "arming" ? "Preparing" :
    phase === "recording" ? "Stop recording" :
    playing ? "Pause" : "Play";

  // Smooth radial waveform path
  const path = useMemo(() => radialSmoothPath(levels, c, c, baseR, baseR + 26 + amp * 22), [levels, amp]);
  const outerPath = useMemo(() => radialSmoothPath(levels, c, c, baseR + 32, baseR + 46 + amp * 34), [levels, amp]);

  const orbColor = phase === "recording"
    ? { core: "oklch(0.82 0.2 55)", mid: "oklch(0.55 0.24 25)", edge: "oklch(0.28 0.16 18)" }
    : playing
    ? { core: "oklch(0.85 0.18 65)", mid: "oklch(0.6 0.22 45)", edge: "oklch(0.3 0.14 35)" }
    : { core: "oklch(0.78 0.18 55)", mid: "oklch(0.55 0.22 35)", edge: "oklch(0.28 0.14 28)" };

  return (
    <div className="relative flex flex-col items-center">
      <motion.div
        animate={releasing ? { opacity: 0.4, scale: 0.9 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 1.2 }}
        className="relative"
        style={{ width: size, height: size }}
      >
        {/* Volumetric bloom halo — reacts to amplitude */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              `radial-gradient(closest-side, ${orbColor.core} 0%, ${orbColor.mid} 25%, transparent 65%)`,
            filter: "blur(24px)",
          }}
          animate={{
            opacity: 0.35 + bloom * 0.35,
            scale: 1 + amp * 0.12,
          }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        />

        {/* Slow floating + breathing */}
        <motion.div
          className="relative h-full w-full"
          animate={{ y: [0, -6, 0, 4, 0], rotate: [0, 0.3, 0, -0.3, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Ambient outward ripples */}
          <Ripples active={active} amp={amp} tint={orbColor.mid} />

          {/* Amplitude-driven escaping particles */}
          <EscapingParticles amp={amp} active={active} />

          {/* Radial waveform — filled + stroked path */}
          <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <radialGradient id="wf-fill" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="oklch(0.9 0.18 55 / .0)" />
                <stop offset="55%" stopColor="oklch(0.78 0.2 45 / .35)" />
                <stop offset="100%" stopColor="oklch(0.55 0.22 30 / .0)" />
              </radialGradient>
              <linearGradient id="wf-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="oklch(0.95 0.16 70)" />
                <stop offset="100%" stopColor="oklch(0.55 0.24 20)" />
              </linearGradient>
              <linearGradient id="wf-stroke-outer" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="oklch(0.92 0.16 60 / .5)" />
                <stop offset="100%" stopColor="oklch(0.55 0.22 25 / .1)" />
              </linearGradient>
            </defs>
            <path d={path} fill="url(#wf-fill)" stroke="url(#wf-stroke)" strokeWidth={1.5} strokeLinejoin="round" opacity={active ? 0.95 : 0.5} />
            <path d={outerPath} fill="none" stroke="url(#wf-stroke-outer)" strokeWidth={1} strokeLinejoin="round" opacity={active ? 0.5 : 0.18} />
          </svg>

          {/* The orb — glass + ember */}
          <motion.button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            disabled={releasing || phase === "arming"}
            className="group absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.85_0.16_55)]/60 disabled:opacity-95"
            style={{
              width: baseR * 2 - 24,
              height: baseR * 2 - 24,
              background: `radial-gradient(circle at 30% 25%, ${orbColor.core} 0%, ${orbColor.mid} 55%, ${orbColor.edge} 100%)`,
              boxShadow: [
                `0 30px 70px -18px ${orbColor.mid}`,
                `0 0 60px ${orbColor.core}`,
                "inset 0 2px 0 oklch(1 0 0 / .35)",
                "inset 0 -22px 32px oklch(0.1 0.04 20 / .55)",
                "inset 0 0 60px oklch(1 0 0 / .05)",
              ].join(", "),
            }}
            animate={{
              scale: phase === "arming"
                ? [1, 1.14, 1.08]
                : active
                ? 1 + amp * 0.08
                : [1, 1.03, 1],
            }}
            transition={{
              duration: phase === "arming" ? 3 : active ? 0.2 : 6,
              repeat: active || phase === "arming" ? 0 : Infinity,
              ease: "easeInOut",
            }}
          >
            {/* Glass reflection sweep */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(ellipse at 30% 20%, oklch(1 0 0 / .5) 0%, oklch(1 0 0 / .1) 20%, transparent 45%)",
                mixBlendMode: "screen",
              }}
            />
            {/* Inner breathing core */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-6 rounded-full"
              style={{
                background:
                  `radial-gradient(circle, oklch(1 0.14 70 / .55) 0%, oklch(0.78 0.2 50 / .25) 45%, transparent 70%)`,
                filter: "blur(4px)",
              }}
              animate={{ opacity: 0.5 + bloom * 0.45, scale: 1 + amp * 0.15 }}
              transition={{ duration: 0.25 }}
            />

            {/* Countdown numeral — announced to screen readers so a
                non-sighted user hears "3, 2, 1" before recording starts. */}
            <div
              aria-live="assertive"
              aria-atomic="true"
              className="sr-only"
            >
              {phase === "arming" && countdown != null ? `Recording in ${countdown}` : ""}
            </div>
            <AnimatePresence mode="popLayout">
              {phase === "arming" && countdown != null && (
                <motion.div
                  key={countdown}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.4 }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                  className="relative font-display text-6xl font-light text-white/95 drop-shadow-[0_2px_8px_oklch(0.35_0.16_25_/_.6)]"
                  aria-hidden="true"
                >
                  {countdown}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Icon */}
            {phase === "idle" && (
              <Mic className="relative h-14 w-14 text-white/95 drop-shadow-[0_1px_4px_oklch(0.2_0.1_25_/_.6)]" strokeWidth={1.5} />
            )}
            {phase === "recording" && (
              <Square className="relative h-11 w-11 text-white drop-shadow-[0_1px_4px_oklch(0.2_0.1_25_/_.6)]" fill="currentColor" />
            )}
            {phase === "review" && (
              playing
                ? <Pause className="relative h-14 w-14 text-white/95 drop-shadow-[0_1px_4px_oklch(0.2_0.1_25_/_.6)]" strokeWidth={1.5} />
                : <Play className="relative h-14 w-14 translate-x-[3px] text-white/95 drop-shadow-[0_1px_4px_oklch(0.2_0.1_25_/_.6)]" strokeWidth={1.5} />
            )}
          </motion.button>

          {/* REC badge floats above the orb while recording */}
          <AnimatePresence>
            {phase === "recording" && (
              <motion.div
                key="rec-badge"
                initial={{ opacity: 0, y: -6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4 }}
                className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[oklch(0.75_0.22_25_/_.5)] bg-[oklch(0.2_0.1_20_/_.65)] px-2.5 py-1 backdrop-blur-md"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[oklch(0.72_0.26_25)] opacity-80" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[oklch(0.66_0.26_25)]" />
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-[oklch(0.94_0.12_45)]">
                  REC
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Timer readout beneath */}
      <div className="mt-6 h-6" role="status" aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="wait">
          {phase === "recording" && (
            <motion.div
              key="rec-time"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="font-display text-[18px] tabular-nums text-white/80"
            >
              {fmt(elapsed)}
            </motion.div>
          )}
          {phase === "review" && duration > 0 && (
            <motion.div
              key="rev-time"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="font-display text-[15px] tabular-nums text-white/60"
            >
              {fmt(currentTime)} <span className="text-white/60">·</span> {fmt(duration)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- */
/* Escaping particles — tiny embers driven by amplitude              */
/* --------------------------------------------------------------- */

function EscapingParticles({ amp, active }: { amp: number; active: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        id: i,
        angle: (i / 14) * Math.PI * 2 + Math.random() * 0.4,
        delay: (i / 14) * 2.4,
        size: 1.5 + Math.random() * 2,
      })),
    [],
  );
  const intensity = Math.min(1, (active ? 0.25 : 0) + amp * 1.4);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {particles.map((p) => {
        const dx = Math.cos(p.angle) * 90;
        const dy = Math.sin(p.angle) * 90;
        return (
          <motion.span
            key={p.id}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: p.size,
              height: p.size,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              background:
                "radial-gradient(circle, oklch(0.95 0.2 65) 0%, oklch(0.72 0.24 35) 55%, transparent 100%)",
              boxShadow: "0 0 6px oklch(0.85 0.22 45 / .8)",
              opacity: 0,
            }}
            animate={{
              x: [0, dx],
              y: [0, dy - 30],
              opacity: [0, intensity * 0.9, 0],
              scale: [0.5, 1, 0.4],
            }}
            transition={{
              duration: 3.6,
              delay: p.delay,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        );
      })}
    </div>
  );
}

function Ripples({ active, amp, tint }: { active: boolean; amp: number; tint: string }) {
  const rings = [0, 1, 2, 3];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {rings.map((i) => (
        <motion.div
          key={i}
          className="absolute inset-8 rounded-full border"
          style={{ borderColor: tint, opacity: 0 }}
          animate={{
            scale: active ? [1, 1.45 + amp * 0.15] : [1, 1.18],
            opacity: active ? [0.35 + amp * 0.35, 0] : [0.18, 0],
          }}
          transition={{
            duration: active ? 3.2 : 5.2,
            repeat: Infinity,
            ease: "easeOut",
            delay: i * (active ? 0.8 : 1.4),
          }}
        />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- */
/* Ghost actions + Use This Voice button                            */
/* --------------------------------------------------------------- */

function GhostAction({
  onClick,
  icon,
  children,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[.04] px-4 py-2 text-[12px] uppercase tracking-[0.18em] text-white/75 backdrop-blur-sm transition hover:bg-white/[.08] " +
        (danger ? "hover:text-[oklch(0.85_0.18_25)]" : "hover:text-white")
      }
    >
      {icon}
      {children}
    </button>
  );
}

function UseThisVoiceButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      animate={{
        boxShadow: [
          "0 0 0 1px oklch(0.85 0.15 55 / .35), 0 12px 40px -10px oklch(0.6 0.24 35 / .6), 0 0 60px -8px oklch(0.75 0.22 45 / .35)",
          "0 0 0 1px oklch(0.85 0.15 55 / .5), 0 18px 48px -8px oklch(0.6 0.24 35 / .75), 0 0 90px -6px oklch(0.75 0.22 45 / .55)",
          "0 0 0 1px oklch(0.85 0.15 55 / .35), 0 12px 40px -10px oklch(0.6 0.24 35 / .6), 0 0 60px -8px oklch(0.75 0.22 45 / .35)",
        ],
      }}
      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      className="group relative inline-flex items-center gap-2.5 rounded-full px-8 py-3.5 text-sm font-medium tracking-wide text-white"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.72 0.2 45) 0%, oklch(0.55 0.22 28) 60%, oklch(0.4 0.22 20) 100%)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-70 blur-2xl"
        style={{
          background: "radial-gradient(50% 50% at 50% 50%, oklch(0.78 0.22 45 / .65), transparent 70%)",
        }}
      />
      <Flame className="h-4 w-4" /> Begin Ritual
    </motion.button>
  );
}

/* --------------------------------------------------------------- */
/* Ambient layers                                                   */
/* --------------------------------------------------------------- */

function FogLayer() {
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-20%] top-[-15%] z-0 h-[70vh] opacity-[.28]"
        style={{
          background:
            "radial-gradient(60% 45% at 30% 40%, oklch(0.85 0.02 60 / .35), transparent 70%), radial-gradient(50% 45% at 70% 60%, oklch(0.8 0.03 55 / .3), transparent 70%)",
          filter: "blur(50px)",
        }}
        animate={{ x: [-80, 60, -40, 80, -80], y: [0, -18, 8, -12, 0] }}
        transition={{ duration: 60, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-10%] bottom-[-25%] z-0 h-[80vh] opacity-[.22]"
        style={{
          background:
            "radial-gradient(60% 50% at 40% 60%, oklch(0.7 0.05 35 / .45), transparent 70%), radial-gradient(50% 45% at 70% 40%, oklch(0.6 0.06 25 / .3), transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ x: [60, -40, 40, -60, 60], y: [0, 12, -8, 14, 0] }}
        transition={{ duration: 75, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

function LightRays() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 opacity-[.18]"
      style={{
        background:
          "conic-gradient(from 200deg at 50% 30%, transparent 0deg, oklch(0.85 0.14 55 / .35) 20deg, transparent 60deg, transparent 200deg, oklch(0.85 0.14 55 / .25) 240deg, transparent 280deg)",
        filter: "blur(28px)",
        mixBlendMode: "screen",
      }}
      animate={{ rotate: [0, 6, 0, -4, 0], opacity: [0.14, 0.22, 0.16, 0.2, 0.14] }}
      transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function CandleGlow({ warmth, flicker }: { warmth: number; flicker?: boolean }) {
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[120vh] w-[120vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.62 0.2 50 / .28), oklch(0.42 0.18 35 / .12) 45%, transparent 78%)",
        }}
        animate={{
          opacity: flicker
            ? warmth
              ? [0.95, 1.05, 0.9, 1.1, 0.95, 1, 0.92, 1.05]
              : [0.72, 0.82, 0.7, 0.86, 0.74, 0.8, 0.7, 0.82]
            : 0.8,
          scale: [1, 1.03, 1, 1.02, 1],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20vh] left-1/2 h-[70vh] w-[120vh] -translate-x-1/2 rounded-full"
        style={{
          background: "radial-gradient(closest-side, oklch(0.55 0.22 40 / .35), transparent 70%)",
          filter: "blur(20px)",
        }}
        animate={{ opacity: warmth ? [0.8, 1, 0.9, 1, 0.85] : [0.55, 0.72, 0.6, 0.72, 0.55] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

function Vignette() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[2]"
      style={{
        background:
          "radial-gradient(120% 100% at 50% 50%, transparent 45%, oklch(0.04 0.02 30 / .9) 100%)",
      }}
    />
  );
}

function DustParticles({ reduced }: { reduced: boolean }) {
  const count = reduced ? 12 : 26;
  const dust = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1 + Math.random() * 2.4,
        drift: (Math.random() - 0.5) * 70,
        rise: 40 + Math.random() * 90,
        delay: Math.random() * 10,
        duration: 22 + Math.random() * 22,
        opacity: 0.14 + Math.random() * 0.32,
      })),
    [count],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {dust.map((d) => (
        <motion.span
          key={d.id}
          className="absolute rounded-full bg-[oklch(0.95_0.05_70)]"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            boxShadow: "0 0 6px oklch(0.85 0.1 60 / .6)",
            opacity: d.opacity,
          }}
          animate={{
            y: [0, -d.rise],
            x: [0, d.drift, 0],
            opacity: [0, d.opacity, 0],
          }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function SmokeDrift() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-[15%] z-0 h-[70vh] opacity-[.22]"
      style={{
        background:
          "radial-gradient(60% 40% at 25% 40%, oklch(0.85 0.02 60 / .35), transparent 70%), radial-gradient(50% 40% at 75% 60%, oklch(0.8 0.03 55 / .3), transparent 70%)",
        filter: "blur(40px)",
      }}
      animate={{ x: [-50, 50, -30, 50, -50], y: [0, -14, 6, -10, 0] }}
      transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function Embers({ reduced }: { reduced: boolean }) {
  const count = reduced ? 6 : 12;
  const embers = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: 20 + Math.random() * 60,
        size: 2 + Math.random() * 3,
        drift: (Math.random() - 0.5) * 90,
        rise: 60 + Math.random() * 50,
        delay: Math.random() * 12,
        duration: 14 + Math.random() * 12,
      })),
    [count],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {embers.map((e) => (
        <motion.span
          key={e.id}
          className="absolute rounded-full"
          style={{
            left: `${e.left}%`,
            bottom: "-4vh",
            width: e.size,
            height: e.size,
            background:
              "radial-gradient(circle, oklch(0.92 0.18 65) 0%, oklch(0.68 0.22 35) 60%, transparent 100%)",
            boxShadow: "0 0 10px oklch(0.75 0.22 40 / .7)",
          }}
          animate={{
            y: [0, `-${e.rise}vh`],
            x: [0, e.drift, e.drift * 0.4],
            opacity: [0, 0.9, 0.6, 0],
          }}
          transition={{
            duration: e.duration,
            delay: e.delay,
            repeat: Infinity,
            ease: "easeOut",
            times: [0, 0.2, 0.7, 1],
          }}
        />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- */
/* Radial smooth path helper — Catmull-Rom-ish smoothing            */
/* --------------------------------------------------------------- */

function radialSmoothPath(
  levels: number[],
  cx: number,
  cy: number,
  baseR: number,
  maxR: number,
): string {
  const n = levels.length;
  if (n === 0) return "";
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = baseR + (maxR - baseR) * levels[i];
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  // Build a closed smoothed path using quadratic curves through midpoints.
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % n];
    const mx = (p0[0] + p1[0]) / 2;
    const my = (p0[1] + p1[1]) / 2;
    d += ` Q ${p0[0].toFixed(2)} ${p0[1].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  d += " Z";
  return d;
}

/* --------------------------------------------------------------- */
/* Haptics                                                          */
/* --------------------------------------------------------------- */

function haptic(ms: number) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      (navigator as any).vibrate?.(ms);
    }
  } catch { /* ignore */ }
}

/* --------------------------------------------------------------- */
/* Ambience — synthesized room bed, ticks, click, tone, vinyl       */
/* --------------------------------------------------------------- */

function createAmbience() {
  let ctx: AudioContext | null = null;
  let bedGain: GainNode | null = null;
  let started = false;
  let stopped = false;
  let crackleTimer: number | null = null;

  function ensure(): AudioContext | null {
    if (stopped) return null;
    if (!ctx) {
      try {
        const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        ctx = new AC();
      } catch { return null; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function startBed(c: AudioContext) {
    // Pink-ish noise via biquad filtered white noise
    const bufferSize = 2 * c.sampleRate;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    lp.Q.value = 0.7;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 40;

    // Very slow amplitude drift for "wind"
    const g = c.createGain();
    g.gain.value = 0.0001;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();

    // Fade in
    const now = c.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.035, now + 3);

    noise.connect(hp).connect(lp).connect(g).connect(c.destination);
    noise.start();
    bedGain = g;

    // Occasional soft fireplace crackles
    const scheduleCrackle = () => {
      if (stopped || !ctx) return;
      const delay = 4000 + Math.random() * 8000;
      crackleTimer = window.setTimeout(() => {
        playCrackle();
        scheduleCrackle();
      }, delay);
    };
    scheduleCrackle();
  }

  function playCrackle() {
    const c = ensure(); if (!c) return;
    const dur = 0.08 + Math.random() * 0.12;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * 0.6;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900 + Math.random() * 1400;
    bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.value = 0.05 + Math.random() * 0.06;
    src.connect(bp).connect(g).connect(c.destination);
    src.start();
  }

  return {
    start() {
      const c = ensure(); if (!c) return;
      if (!started) {
        started = true;
        startBed(c);
      }
    },
    stop() {
      stopped = true;
      if (crackleTimer) window.clearTimeout(crackleTimer);
      crackleTimer = null;
      if (ctx && bedGain) {
        const now = ctx.currentTime;
        try {
          bedGain.gain.cancelScheduledValues(now);
          bedGain.gain.setValueAtTime(bedGain.gain.value, now);
          bedGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        } catch { /* ignore */ }
      }
      window.setTimeout(() => { try { ctx?.close(); } catch { /* ignore */ } ctx = null; }, 600);
    },
    playInhale() {
      const c = ensure(); if (!c) return;
      // Rising filtered noise "breath in"
      const dur = 0.9;
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
      const g = c.createGain(); g.gain.value = 0.0001;
      const now = c.currentTime;
      bp.frequency.setValueAtTime(400, now);
      bp.frequency.exponentialRampToValueAtTime(1400, now + dur);
      g.gain.exponentialRampToValueAtTime(0.09, now + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(bp).connect(g).connect(c.destination);
      src.start();
      src.stop(now + dur + 0.05);
    },
    playTick() {
      const c = ensure(); if (!c) return;
      const now = c.currentTime;
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.connect(g).connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    },
    playMicClick() {
      const c = ensure(); if (!c) return;
      const now = c.currentTime;
      // Short filtered noise burst
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.06), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = "bandpass";
      bp.frequency.value = 2400; bp.Q.value = 0.9;
      const g = c.createGain(); g.gain.value = 0.06;
      src.connect(bp).connect(g).connect(c.destination);
      src.start(now);
    },
    playConfirmTone() {
      const c = ensure(); if (!c) return;
      const now = c.currentTime;
      // Warm two-tone bell
      const freqs = [523.25, 783.99];
      freqs.forEach((f, i) => {
        const osc = c.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, now + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.07, now + i * 0.06 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.9);
        osc.connect(g).connect(c.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 1.0);
      });
    },
    playVinylClick() {
      const c = ensure(); if (!c) return;
      const now = c.currentTime;
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.05), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2) * 0.6;
      const src = c.createBufferSource(); src.buffer = buf;
      const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800;
      const g = c.createGain(); g.gain.value = 0.05;
      src.connect(hp).connect(g).connect(c.destination);
      src.start(now);
    },
  };
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
