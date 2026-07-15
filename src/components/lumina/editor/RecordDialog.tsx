import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Check } from "lucide-react";
import { pickMimeType, saveVoice } from "@/lib/farewell/voice";
import { toast } from "sonner";

type Props = {
  onClose: () => void;
  onSave: (voiceId: string, durationSec: number) => void;
};

const uid = () => Math.random().toString(36).slice(2, 12);

export function RecordDialog({ onClose, onSave }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "ready">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAt = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const durationRef = useRef<number>(0);

  useEffect(() => () => cleanup(), []);

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (recRef.current && recRef.current.state !== "inactive") try { recRef.current.stop(); } catch { /* noop */ }
    recRef.current = null;
    analyserRef.current = null;
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        blobRef.current = blob;
        durationRef.current = (Date.now() - startedAt.current) / 1000;
        setState("ready");
      };
      rec.start(200);
      recRef.current = rec;
      startedAt.current = Date.now();
      setState("recording");
      setElapsed(0);

      // Live meter
      const AC: typeof AudioContext | undefined =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 128;
        src.connect(an);
        analyserRef.current = an;
        const data = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setLevels((L) => {
            const next = [...L, Math.min(1, rms * 3)];
            return next.length > 48 ? next.slice(next.length - 48) : next;
          });
          setElapsed((Date.now() - startedAt.current) / 1000);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch {
      toast.error("Microphone unavailable");
      onClose();
    }
  };

  const stop = () => {
    if (recRef.current && recRef.current.state !== "inactive") {
      try { recRef.current.stop(); } catch { /* noop */ }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const discard = () => {
    cleanup();
    blobRef.current = null;
    setState("idle");
    setLevels([]);
    setElapsed(0);
  };

  const save = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    const voiceId = `${Date.now().toString(36)}-${uid()}`;
    try {
      await saveVoice("note", voiceId, blob, durationRef.current);
      onSave(voiceId, durationRef.current);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save voice memory");
    }
  };

  const fmt = (s: number) => {
    const t = Math.max(0, Math.floor(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  };

  return (
    <div className="lumina-rec-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && state !== "recording") onClose(); }}>
      <div className="lumina-rec">
        <div className="lumina-rec-orb" data-recording={state === "recording" ? "true" : "false"}>
          <Mic className="h-8 w-8" />
        </div>
        <div className="font-display text-2xl">
          {state === "idle" && "Record a voice memory"}
          {state === "recording" && "Listening…"}
          {state === "ready" && "Sounds lovely"}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {state === "idle" && "Press start when you're ready."}
          {state === "recording" && fmt(elapsed)}
          {state === "ready" && `${fmt(durationRef.current)} · ready to save`}
        </div>

        {levels.length > 0 && (
          <div className="mt-5 flex items-end justify-center gap-1 h-14">
            {levels.map((v, i) => (
              <span
                key={i}
                className="block w-1 rounded-full bg-gradient-to-t from-[oklch(0.72_0.13_340)] to-[oklch(0.68_0.14_290)]"
                style={{ height: `${Math.max(6, v * 100)}%` }}
              />
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          {state === "idle" && (
            <>
              <button
                onClick={onClose}
                className="rounded-full px-5 py-2 text-sm text-muted-foreground hover:bg-white/50 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={start}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.72_0.13_340)] to-[oklch(0.68_0.14_290)] px-6 py-2 text-sm font-medium text-white shadow-md"
              >
                <Mic className="h-4 w-4" /> Start
              </button>
            </>
          )}
          {state === "recording" && (
            <button
              onClick={stop}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-400 to-rose-500 px-6 py-2 text-sm font-medium text-white shadow-md"
            >
              <Square className="h-4 w-4 fill-current" /> Stop
            </button>
          )}
          {state === "ready" && (
            <>
              <button
                onClick={discard}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm text-muted-foreground hover:bg-white/50 dark:hover:bg-white/10"
              >
                <Trash2 className="h-4 w-4" /> Discard
              </button>
              <button
                onClick={save}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.72_0.13_340)] to-[oklch(0.68_0.14_290)] px-6 py-2 text-sm font-medium text-white shadow-md"
              >
                <Check className="h-4 w-4" /> Save memory
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
