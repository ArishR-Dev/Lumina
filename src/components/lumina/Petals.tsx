import { useEffect, useMemo, useState } from "react";

function prefersLiteMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    const coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const cores = navigator.hardwareConcurrency || 8;
    // Keep petals, but lighten the load on phones / low-core devices.
    return coarse || cores <= 4;
  } catch {
    return false;
  }
}

export function Petals({ count = 14 }: { count?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const effectiveCount = useMemo(() => {
    if (!mounted) return count;
    return prefersLiteMotion() ? Math.max(6, Math.round(count * 0.5)) : count;
  }, [count, mounted]);

  const petals = useMemo(
    () =>
      Array.from({ length: effectiveCount }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 20,
        duration: 18 + Math.random() * 22,
        size: 10 + Math.random() * 18,
        drift: (Math.random() - 0.5) * 220,
        hue: 320 + Math.random() * 40,
        sparkle: Math.random() > 0.7,
        top: Math.random() * 100,
      })),
    [effectiveCount],
  );

  useEffect(() => {
    if (!mounted) return;
    const onVis = () => {
      document.documentElement.toggleAttribute("data-ambient-paused", document.hidden);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [mounted]);

  if (!mounted) return null;
  return (
    <div
      data-scroll-pause
      className="petal-layer pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ contain: "strict", contentVisibility: "auto" }}
      aria-hidden
    >
      {petals.map((p) =>
        p.sparkle ? (
          <span
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: 4,
              height: 4,
              background: `oklch(0.9 0.08 ${p.hue})`,
              boxShadow: `0 0 12px oklch(0.85 0.12 ${p.hue})`,
              animation: `twinkle ${3 + Math.random() * 4}s ease-in-out ${p.delay}s infinite`,
              opacity: 0.55,
              transform: "translateZ(0)",
            }}
          />
        ) : (
          <span
            key={p.id}
            className="absolute block"
            style={{
              left: `${p.left}%`,
              top: "-10vh",
              width: p.size,
              height: p.size,
              // @ts-expect-error css var
              "--drift": `${p.drift}px`,
              background: `radial-gradient(circle at 30% 30%, oklch(0.95 0.08 ${p.hue}), oklch(0.82 0.13 ${p.hue}))`,
              borderRadius: "70% 30% 70% 30% / 40% 60% 40% 60%",
              opacity: 0.7,
              transform: "translateZ(0)",
              animation: `float-petal ${p.duration}s linear ${p.delay}s infinite`,
            }}
          />
        ),
      )}
    </div>
  );
}
