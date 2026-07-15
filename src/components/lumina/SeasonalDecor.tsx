import { useEffect, useState } from "react";
import { season } from "@/lib/lumina-greetings";

// Very subtle, low-density seasonal accents layered above the base petals.
// Kept intentionally minimal to preserve the existing visual identity.
export function SeasonalDecor() {
  const [s, setS] = useState(() => season());
  useEffect(() => {
    const t = setInterval(() => setS(season()), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  if (s === "spring") return null; // spring is already covered by <Petals />
  const particles = Array.from({ length: 8 });
  const symbol = s === "summer" ? "✦" : s === "autumn" ? "🍂" : "❄";
  const color =
    s === "summer" ? "oklch(0.9 0.12 85 / 0.55)" : s === "autumn" ? "oklch(0.7 0.15 55 / 0.7)" : "oklch(0.95 0.02 240 / 0.75)";
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" style={{ contain: "paint" }}>
      {particles.map((_, i) => {
        const left = (i * 13 + 7) % 100;
        const delay = (i * 1.7) % 12;
        const duration = 18 + ((i * 3) % 10);
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: "-8%",
              color,
              fontSize: s === "autumn" ? 18 : 14,
              animation: `lumina-fall ${duration}s linear ${delay}s infinite`,
              opacity: 0.7,
            }}
          >
            {symbol}
          </span>
        );
      })}
      <style>{`@keyframes lumina-fall { 0% { transform: translate3d(0,-10vh,0) rotate(0deg); opacity: 0 } 10% { opacity: .7 } 90% { opacity: .7 } 100% { transform: translate3d(20px,110vh,0) rotate(360deg); opacity: 0 } }`}</style>
    </div>
  );
}