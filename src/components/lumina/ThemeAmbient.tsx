import { useMemo } from "react";
import { useLumina } from "@/lib/lumina-store";

// Deterministic-ish PRNG so particle layout is stable across renders
// within a mount, but freshly randomized on each new page mount.
function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

type Particle = {
  id: number;
  left: number;      // %
  top: number;       // %
  size: number;      // px
  duration: number;  // s
  delay: number;     // s
  driftX: number;    // px
  driftY: number;    // px
  opacity: number;
  kind: "dot" | "bokeh" | "sparkle";
};

// Theme → particle visual language. Kept minimal: color hue + rendering kind.
// Sizes/opacity mixed within one theme for variety.
const THEME_STYLES: Record<
  string,
  { hue: number; light: number; chroma: number; kinds: Particle["kind"][] }
> = {
  midnight:  { hue: 245, light: 0.92, chroma: 0.14, kinds: ["dot", "sparkle"] },
  ocean:     { hue: 210, light: 0.94, chroma: 0.12, kinds: ["bokeh", "dot"] },
  arctic:    { hue: 230, light: 0.98, chroma: 0.06, kinds: ["sparkle", "dot"] },
  rain:      { hue: 250, light: 0.9,  chroma: 0.05, kinds: ["bokeh"] },
  galaxy:    { hue: 280, light: 0.9,  chroma: 0.16, kinds: ["sparkle", "dot"] },
  sapphire:  { hue: 240, light: 0.95, chroma: 0.14, kinds: ["sparkle", "bokeh"] },
  sakura:    { hue: 340, light: 0.9,  chroma: 0.12, kinds: ["bokeh", "dot"] },
  lavender:  { hue: 300, light: 0.9,  chroma: 0.11, kinds: ["bokeh", "sparkle"] },
  coffee:    { hue: 55,  light: 0.85, chroma: 0.09, kinds: ["dot", "bokeh"] },
  peach:     { hue: 35,  light: 0.9,  chroma: 0.13, kinds: ["bokeh", "sparkle"] },
};

export function ThemeAmbient({ count = 32 }: { count?: number }) {
  const theme = useLumina((s) => s.theme);
  const style = THEME_STYLES[theme] ?? THEME_STYLES.midnight;

  // Android perf: halve particle density on touch devices. Composited
  // ambient layers are the single biggest scroll-jank source on phone GPUs.
  const effectiveCount = useMemo(() => {
    if (typeof window === "undefined") return count;
    const coarse = window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;
    return coarse ? Math.max(8, Math.round(count * 0.45)) : count;
  }, [count]);


  const particles = useMemo<Particle[]>(() => {
    const r = rand(Date.now() & 0xffff);
    return Array.from({ length: effectiveCount }).map((_, i) => {
      const kind = style.kinds[Math.floor(r() * style.kinds.length)];
      const size =
        kind === "bokeh" ? 10 + r() * 22 : kind === "sparkle" ? 2 + r() * 3 : 3 + r() * 5;
      return {
        id: i,
        left: r() * 100,
        top: r() * 100,
        size,
        duration: 14 + r() * 18,
        delay: -r() * 25,
        driftX: (r() - 0.5) * 60,
        driftY: (r() - 0.5) * 80,
        opacity: 0.08 + r() * 0.1,
        kind,
      };
    });
  }, [effectiveCount, style.kinds]);


  const color = `oklch(${style.light} ${style.chroma} ${style.hue})`;

  return (
    <div aria-hidden className="theme-ambient pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" style={{ contain: "paint" }}>
      {particles.map((p) => (
        <span
          key={p.id}
          className={`ambient-particle ambient-${p.kind}`}
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            // @ts-expect-error css vars
            "--pcolor": color,
            "--pdur": `${p.duration}s`,
            "--pdelay": `${p.delay}s`,
            "--pdx": `${p.driftX}px`,
            "--pdy": `${p.driftY}px`,
            "--popacity": p.opacity,
          }}
        />
      ))}
    </div>
  );
}
