import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, CloudRain, Waves, Trees, Coffee, Music4, VolumeX, Timer } from "lucide-react";
import { RichEditor } from "./RichEditor";
import { playAmbient, setAmbientVolume, type Ambient } from "@/lib/ambient-audio";
import { cn } from "@/lib/utils";

const sounds: { key: Ambient; label: string; icon: React.ReactNode }[] = [
  { key: "off", label: "Silence", icon: <VolumeX className="h-4 w-4" /> },
  { key: "rain", label: "Rain", icon: <CloudRain className="h-4 w-4" /> },
  { key: "ocean", label: "Ocean", icon: <Waves className="h-4 w-4" /> },
  { key: "forest", label: "Forest", icon: <Trees className="h-4 w-4" /> },
  { key: "cafe", label: "Cafe", icon: <Coffee className="h-4 w-4" /> },
  { key: "piano", label: "Piano", icon: <Music4 className="h-4 w-4" /> },
];

export function FocusMode({
  open, onClose, content, onChange, title,
}: {
  open: boolean;
  onClose: () => void;
  content: string;
  onChange: (html: string) => void;
  title: string;
}) {
  const [ambient, setAmbient] = useState<Ambient>("off");
  const [volume, setVolume] = useState(0.35);
  const [timerMin, setTimerMin] = useState(0);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) playAmbient("off");
  }, [open]);

  useEffect(() => { setAmbientVolume(volume); }, [volume]);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const startTimer = () => setRemaining(timerMin * 60);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="lumina-scroll fixed inset-0 z-[90] overflow-y-auto overflow-x-hidden bg-background/95 backdrop-blur-xl"
          data-scroll-root
        >
          <button
            aria-label="Close focus mode"
            onClick={onClose}
            className="glass fixed right-3 z-[93] grid h-10 w-10 place-items-center rounded-full shadow-lg hover:bg-white/60 dark:hover:bg-white/10"
            style={{ top: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[91] flex flex-wrap items-center justify-between gap-2 p-3 pr-16 sm:p-4 sm:pr-20">
            <div className="pointer-events-auto glass flex max-w-full items-center gap-1 overflow-x-auto rounded-full px-2 py-1">
              {sounds.map((s) => (
                <button
                  key={s.key}
                  aria-label={s.label}
                  onClick={() => { setAmbient(s.key); void playAmbient(s.key); }}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition",
                    ambient === s.key ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-white/50 dark:hover:bg-white/10",
                  )}
                >
                  {s.icon}<span className="hidden sm:inline">{s.label}</span>
                </button>
              ))}
              {ambient !== "off" && (
                <input
                  aria-label="Volume"
                  type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="ml-2 h-1 w-20 shrink-0 accent-primary"
                />
              )}
            </div>
            <div className="pointer-events-auto glass flex items-center gap-3 rounded-full px-3 py-1.5">
              <Timer className="h-4 w-4 text-muted-foreground" />
              {remaining > 0 ? (
                <span className="font-display text-lg tabular-nums">{fmt(remaining)}</span>
              ) : (
                <>
                  <input
                    aria-label="Zen minutes"
                    type="number" min={0} max={90} value={timerMin}
                    onChange={(e) => setTimerMin(parseInt(e.target.value || "0", 10))}
                    className="w-14 rounded-md bg-transparent text-sm outline-none"
                  />
                  <button type="button" onClick={startTimer} className="lumina-focus-ring rounded-md px-2 py-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">start</button>
                </>
              )}
            </div>
          </div>

          <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
            <h1 className="font-display text-4xl leading-tight text-foreground/90">{title || "Untitled"}</h1>
            <div className="mt-4 h-px w-16 bg-gradient-to-r from-primary to-transparent" />
            <div className="mt-8 focus-mode-writing">
              <RichEditor content={content} onChange={onChange} autofocus placeholder="Type freely — the world can wait." />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}