import { useEffect, useMemo, useState } from "react";

export function Petals({ count = 14 }: { count?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const petals = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 20,
        duration: 18 + Math.random() * 22,
        size: 10 + Math.random() * 18,
        drift: (Math.random() - 0.5) * 220,
        hue: 320 + Math.random() * 40,
        sparkle: Math.random() > 0.6,
      })),
    [count],
  );
  if (!mounted) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ contain: "paint" }}>
      {petals.map((p) =>
        p.sparkle ? (
          <span
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.left}%`,
              top: `${Math.random() * 100}%`,
              width: 4,
              height: 4,
              background: `oklch(0.9 0.08 ${p.hue})`,
              boxShadow: `0 0 12px oklch(0.85 0.12 ${p.hue})`,
              animation: `twinkle ${3 + Math.random() * 4}s ease-in-out ${p.delay}s infinite`,
              opacity: 0.6,
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
              opacity: 0.75,
              willChange: "transform, opacity",
              animation: `float-petal ${p.duration}s linear ${p.delay}s infinite`,
            }}

          />
        ),
      )}
    </div>
  );
}