import { useState } from "react";
import { Headphones, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { useIsMobile } from "@/hooks/use-mobile";
import { AMBIENTS, useAmbient, type AmbientKind } from "@/lib/ambient-audio";
import { cn } from "@/lib/utils";

/**
 * Writing Atmosphere — persistent access to ambient soundscapes.
 *
 * Desktop: glass popover anchored to a toolbar icon.
 * Mobile:  bottom sheet triggered by the same icon.
 *
 * No autoplay: nothing sounds until the user explicitly picks an option.
 * Selection + volume persist in localStorage.
 */
export function WritingAtmosphere() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { kind, volume, playing, select, pause, resume, setVolume } = useAmbient();

  const current = AMBIENTS.find((a) => a.key === kind);

  const trigger = (
    <button
      aria-label="Writing atmosphere"
      title={current ? `Atmosphere · ${current.label}` : "Writing atmosphere"}
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-full transition sm:h-9 sm:w-9",
        kind !== "off"
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10",
      )}
    >
      <Headphones className="h-4 w-4" />
      {kind !== "off" && (
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-background",
            playing ? "bg-primary" : "bg-muted-foreground/60",
          )}
        />
      )}
    </button>
  );

  const body = (
    <AtmospherePanel
      kind={kind}
      volume={volume}
      playing={playing}
      onSelect={(k) => select(k)}
      onPause={() => pause()}
      onResume={() => resume()}
      onVolume={(v) => setVolume(v)}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-white/40 bg-white/85 pb-8 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/85"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-xl">Writing atmosphere</SheetTitle>
          </SheetHeader>
          <div className="mt-3">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(320px,calc(100vw-2rem))] rounded-2xl border-white/50 bg-white/85 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/85"
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="font-display text-base">Writing atmosphere</div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            {current && kind !== "off" ? current.label : "Off"}
          </div>
        </div>
        {body}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------ panel body ------------------------------ */

function AtmospherePanel({
  kind, volume, playing, onSelect, onPause, onResume, onVolume,
}: {
  kind: AmbientKind;
  volume: number;
  playing: boolean;
  onSelect: (k: AmbientKind) => void;
  onPause: () => void;
  onResume: () => void;
  onVolume: (v: number) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        <OptionTile
          active={kind === "off"}
          emoji="🔇"
          label="Off"
          onClick={() => onSelect("off")}
        />
        {AMBIENTS.map((a) => (
          <OptionTile
            key={a.key}
            active={kind === a.key}
            emoji={a.emoji}
            label={a.label}
            onClick={() => onSelect(a.key)}
          />
        ))}
      </div>

      {/* Transport + volume */}
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/60 px-3 py-2.5 dark:bg-white/5">
        <button
          onClick={() => (playing ? onPause() : onResume())}
          aria-label={playing ? "Pause atmosphere" : "Play atmosphere"}
          disabled={kind === "off"}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition",
            kind === "off"
              ? "cursor-not-allowed text-muted-foreground/50"
              : "bg-primary/15 text-primary hover:bg-primary/25",
          )}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="flex flex-1 items-center gap-2">
          {volume === 0 ? (
            <VolumeX className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <Slider
            value={[Math.round(volume * 100)]}
            onValueChange={([v]) => onVolume((v ?? 0) / 100)}
            min={0}
            max={100}
            step={1}
            aria-label="Volume"
            className="flex-1"
          />
          <span className="w-8 text-right text-[10px] uppercase tracking-widest text-muted-foreground">
            {Math.round(volume * 100)}
          </span>
        </div>
      </div>

      <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground">
        Ambient soundscapes to accompany writing. Loops seamlessly, crossfades between selections, remembers your last choice.
      </p>
    </div>
  );
}

function OptionTile({
  active, emoji, label, onClick,
}: {
  active: boolean;
  emoji: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[11px] transition",
        active
          ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
          : "bg-white/50 text-muted-foreground hover:bg-white/80 hover:text-foreground dark:bg-white/5 dark:hover:bg-white/10",
      )}
    >
      <span className="text-lg leading-none" aria-hidden>{emoji}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
