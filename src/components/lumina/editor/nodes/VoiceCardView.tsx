import { useEffect, useMemo, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Play, Pause, Trash2 } from "lucide-react";
import { loadVoice, deleteVoice } from "@/lib/farewell/voice";
import { computeVoicePeaks, getCachedVoicePeaks } from "@/lib/farewell/waveform";

export function VoiceCardView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const voiceId = String(node.attrs.voiceId || "");
  const record = useMemo(() => (voiceId ? loadVoice("note", voiceId) : null), [voiceId]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [nowTick, setNowTick] = useState(0);
  const [peaks, setPeaks] = useState<number[] | null>(() => {
    if (!record) return null;
    const cached = getCachedVoicePeaks(record.dataUrl, 48);
    return cached ? cached.mag : null;
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!record || peaks) return;
    let cancel = false;
    computeVoicePeaks(record.dataUrl, 48).then((p) => {
      if (!cancel) setPeaks(p.mag);
    });
    return () => { cancel = true; };
  }, [record, peaks]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnd = () => { setPlaying(false); setProgress(0); };
    const onTime = () => {
      if (!a.duration || !isFinite(a.duration)) return;
      setProgress(a.currentTime / a.duration);
    };
    a.addEventListener("ended", onEnd);
    a.addEventListener("timeupdate", onTime);
    return () => {
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("timeupdate", onTime);
    };
  }, []);

  // Refresh the relative time label every 60s so "just now" ages gracefully.
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  void nowTick;

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { void a.play(); setPlaying(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    const wave = waveRef.current;
    if (!a || !wave || !a.duration || !isFinite(a.duration)) return;
    const rect = wave.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * a.duration;
    setProgress(ratio);
  };

  const remove = () => {
    if (voiceId) deleteVoice("note", voiceId);
    deleteNode();
  };

  const fmt = (s: number) => {
    const t = Math.max(0, Math.round(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  };

  const formatRecordedAt = (ts?: number) => {
    if (!ts) return "just now";
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (sameDay) return `Today · ${time}`;
    if (isYesterday) return `Yesterday · ${time}`;
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + ` · ${time}`;
  };

  const barCount = peaks?.length ?? 48;
  const playedBars = Math.round(progress * barCount);

  return (
    <NodeViewWrapper as="div" className="lumina-voice" data-playing={playing ? "true" : "false"} contentEditable={false}>
      <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="lumina-voice-play">
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
      </button>
      <div className="lumina-voice-body">
        <input
          className="lumina-voice-title"
          placeholder="Voice memory"
          value={String(node.attrs.title || "")}
          onChange={(e) => updateAttributes({ title: e.target.value })}
        />
        <div
          ref={waveRef}
          className="lumina-voice-wave"
          role="slider"
          aria-label="Seek voice memory"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onMouseDown={seek}
        >
          {(peaks || Array(48).fill(0.2)).map((v, i) => (
            <span
              key={i}
              data-played={i < playedBars ? "true" : "false"}
              style={{ height: `${Math.max(10, v * 100)}%` }}
            />
          ))}
          <span className="lumina-voice-playhead" style={{ left: `${progress * 100}%` }} aria-hidden />
        </div>
        <div className="lumina-voice-recorded">
          Recorded · {formatRecordedAt(record?.createdAt)}
        </div>
      </div>
      <span className="lumina-voice-meta">{fmt(Number(node.attrs.duration) || record?.duration || 0)}</span>
      <button type="button" onClick={remove} aria-label="Delete voice memory" className="ml-2 grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:text-destructive sm:h-8 sm:w-8">
        <Trash2 className="h-4 w-4" />
      </button>
      {record && <audio ref={audioRef} src={record.dataUrl} preload="metadata" />}
    </NodeViewWrapper>
  );
}
