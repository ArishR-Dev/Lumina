// VoiceMemory — optional spoken message attached to a Farewell memory.
//
// Compact, quiet UI that sits on the preview page:
//   idle       → "🎙 Record" button + hint
//   recording  → animated waveform, timer, soft red indicator, gentle pulse
//   review     → seek bar, play/pause, duration, re-record, delete
//
// The component fully owns MediaRecorder lifecycle and cleans up streams
// and object URLs on unmount / state changes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteVoice,
  loadVoice,
  pickMimeType,
  saveVoice,
  type VoiceRecord,
} from "@/lib/farewell/voice";
import type { EntityKind } from "@/lib/farewell/entities";

type Props = {
  kind: EntityKind;
  id: string;
};

type Phase = "idle" | "recording" | "review";

export function VoiceMemory({ kind, id }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [record, setRecord] = useState<VoiceRecord | null>(() => loadVoice(kind, id));
  const [elapsed, setElapsed] = useState(0); // recording seconds
  const [levels, setLevels] = useState<number[]>(() => Array(28).fill(0.05));
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setRecord(loadVoice(kind, id));
    setPhase(loadVoice(kind, id) ? "review" : "idle");
  }, [kind, id]);

  useEffect(() => {
    return () => {
      stopStream();
      cancelAnimation();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
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

  function cancelAnimation() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  const startRecording = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording isn't available in this browser.");
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
          const saved = await saveVoice(kind, id, blob, duration);
          setRecord(saved);
          setPhase("review");
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Could not save recording.");
          setPhase("idle");
        } finally {
          stopStream();
          cancelAnimation();
        }
      };

      // Waveform tap
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        const a = analyserRef.current;
        if (!a) return;
        a.getByteFrequencyData(data);
        // pick 28 bins spread across the spectrum
        const bars: number[] = [];
        const step = Math.max(1, Math.floor(data.length / 28));
        for (let i = 0; i < 28; i++) {
          const v = data[i * step] ?? 0;
          bars.push(Math.min(1, Math.max(0.04, v / 200)));
        }
        setLevels(bars);
        setElapsed((performance.now() - startedAtRef.current) / 1000);
        rafRef.current = requestAnimationFrame(tick);
      };

      startedAtRef.current = performance.now();
      setElapsed(0);
      rec.start(100);
      setPhase("recording");
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Could not start recording.",
      );
      stopStream();
    }
  }, [kind, id]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const remove = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    deleteVoice(kind, id);
    setRecord(null);
    setPlaying(false);
    setCurrentTime(0);
    setPhase("idle");
  }, [kind, id]);

  // --- Playback ---
  useEffect(() => {
    if (!record) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.src = record.dataUrl;
    a.preload = "metadata";
    // Seed duration immediately from the saved record so the transport
    // never shows 0:00 / 0:00 while metadata is still loading.
    setAudioDuration(record.duration && isFinite(record.duration) ? record.duration : 0);

    const reconcile = () => {
      const d = a.duration;
      if (isFinite(d) && d > 0) {
        setAudioDuration(d);
        return;
      }
      // Chromium reports Infinity for MediaRecorder webm/opus blobs.
      // Seek past the end to force the demuxer to compute a real duration.
      if (d === Infinity) {
        const onSeeked = () => {
          a.removeEventListener("seeked", onSeeked);
          try { a.currentTime = 0; } catch { /* ignore */ }
          if (isFinite(a.duration) && a.duration > 0) setAudioDuration(a.duration);
        };
        a.addEventListener("seeked", onSeeked);
        try { a.currentTime = 1e9; } catch { /* ignore */ }
      }
    };

    const onTime = () => setCurrentTime(a.currentTime);
    const onEnd = () => { setPlaying(false); setCurrentTime(0); };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("pause", onPause);
    a.addEventListener("play", onPlay);
    a.addEventListener("loadedmetadata", reconcile);
    a.addEventListener("durationchange", reconcile);
    a.addEventListener("canplay", reconcile);
    // If metadata is already available (e.g. re-mount), reconcile now.
    reconcile();
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("loadedmetadata", reconcile);
      a.removeEventListener("durationchange", reconcile);
      a.removeEventListener("canplay", reconcile);
    };
  }, [record]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play(); else a.pause();
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const v = Number(e.target.value);
    a.currentTime = v;
    setCurrentTime(v);
  };

  const duration =
    (audioDuration && isFinite(audioDuration) && audioDuration > 0 ? audioDuration : 0) ||
    (record?.duration && isFinite(record.duration) ? record.duration : 0);

  const title = useMemo(() => {
    if (phase === "recording") return "Recording…";
    if (phase === "review") return "Voice Memory";
    return "Voice Memory (Optional)";
  }, [phase]);

  return (
    <div className="mt-4 rounded-2xl border border-white/60 bg-white/40 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          <span aria-hidden>🎙</span>
          <span>{title}</span>
        </div>
        {phase === "recording" && (
          <div className="flex items-center gap-2 text-[11px] tabular-nums text-[oklch(0.55_0.22_25)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[oklch(0.65_0.24_25)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[oklch(0.6_0.24_25)]" />
            </span>
            <span>{fmt(elapsed)}</span>
          </div>
        )}
      </div>

      {phase === "idle" && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            Leave one final spoken message. It will play softly as the paper burns.
          </p>
          <button
            onClick={startRecording}
            className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-2 text-sm font-medium text-foreground/80 shadow-sm transition hover:text-foreground dark:border-white/10 dark:bg-white/10"
          >
            <Mic className="h-4 w-4" /> Record
          </button>
        </div>
      )}

      {phase === "recording" && (
        <div className="mt-4">
          <MicPulseBars levels={levels} />
          <div className="mt-3 flex items-center justify-end">
            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-full bg-[oklch(0.55_0.22_25)] px-4 py-2 text-sm font-medium text-white shadow-[0_10px_28px_-14px_oklch(0.5_0.22_30_/_.7)]"
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" /> Stop
            </button>
          </div>
        </div>
      )}

      {phase === "review" && record && (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                "bg-gradient-to-br from-[oklch(0.72_0.2_40)] to-[oklch(0.55_0.22_25)] text-white shadow-[0_10px_28px_-14px_oklch(0.5_0.22_30_/_.7)]",
              )}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
            </button>
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={Math.max(0.1, duration)}
                step={0.05}
                value={Math.min(currentTime, duration || 0)}
                onChange={onSeek}
                className="w-full accent-[oklch(0.6_0.22_30)]"
                aria-label="Seek"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
                <span>{fmt(currentTime)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={startRecording}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-[12px] text-muted-foreground transition hover:text-foreground dark:border-white/10 dark:bg-white/10"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-record
            </button>
            <button
              onClick={remove}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-[12px] text-muted-foreground transition hover:text-[oklch(0.55_0.22_25)] dark:border-white/10 dark:bg-white/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-[oklch(0.85_0.14_60_/_.5)] bg-[oklch(0.97_0.03_70_/_.7)] px-3 py-2 text-[12px] text-[oklch(0.4_0.13_35)] dark:border-[oklch(0.4_0.08_50_/_.4)] dark:bg-[oklch(0.24_0.05_30_/_.4)] dark:text-[oklch(0.88_0.08_55)]">
          {error}
        </div>
      )}
    </div>
  );
}

function MicPulseBars({ levels }: { levels: number[] }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -m-2 rounded-full bg-[oklch(0.7_0.22_25_/_.10)] blur-2xl" />
      <div className="relative flex h-14 items-center justify-center gap-[3px] rounded-xl bg-black/[.04] px-3 dark:bg-white/[.04]">
        {levels.map((v, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-gradient-to-t from-[oklch(0.72_0.2_40)] to-[oklch(0.55_0.22_25)]"
            style={{ height: `${Math.max(6, v * 100)}%`, transition: "height 90ms linear" }}
          />
        ))}
      </div>
    </div>
  );
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
