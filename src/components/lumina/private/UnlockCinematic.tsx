import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";

/**
 * Fullscreen cinematic overlay played when the Private Album is unlocked
 * from the Home gesture. Compact (~1.35s) and responsive: ring + lock
 * scale down on narrow viewports so nothing overflows on phones.
 *
 * Respects prefers-reduced-motion — vestibular users get a brief calm
 * fade instead of the full iris + halo sequence.
 */
export function UnlockCinematic() {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <motion.div
        key="private-unlock-cinematic-reduced"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, times: [0, 0.2, 0.7, 1] }}
        className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-[oklch(0.12_0.06_290)]"
        aria-hidden
      >
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10">
          <Lock className="h-6 w-6 text-[oklch(0.95_0.08_85)]" />
        </div>
      </motion.div>
    );
  }
  const particles = Array.from({ length: 14 });

  return (
    <motion.div
      key="private-unlock-cinematic"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      aria-hidden
    >
      {/* Curtain — deep gradient irises in */}
      <motion.div
        initial={{ clipPath: "circle(0% at 50% 50%)" }}
        animate={{ clipPath: ["circle(0% at 50% 50%)", "circle(140% at 50% 50%)"] }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 50%, oklch(0.28 0.09 300) 0%, oklch(0.12 0.06 290) 55%, oklch(0.06 0.04 280) 100%)",
        }}
      />

      {/* Vignette breath */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.85, 0.5] }}
        transition={{ duration: 1.1, times: [0, 0.4, 1] }}
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 50%, transparent 40%, oklch(0 0 0 / 0.55) 100%)",
        }}
      />

      {/* Rising golden dust */}
      <div className="absolute inset-0">
        {particles.map((_, i) => {
          const x = (i / particles.length) * 100 + (Math.sin(i * 12.9) * 6);
          const delay = 0.15 + (i % 6) * 0.05;
          const size = 2 + (i % 3);
          return (
            <motion.span
              key={i}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: -180, opacity: [0, 0.9, 0] }}
              transition={{ duration: 1.1, delay, ease: "easeOut" }}
              className="absolute rounded-full"
              style={{
                left: `${x}%`,
                bottom: "40%",
                width: size,
                height: size,
                background:
                  "radial-gradient(circle, oklch(0.92 0.14 85 / 0.95), oklch(0.75 0.16 60 / 0) 70%)",
                filter: "blur(0.5px)",
              }}
            />
          );
        })}
      </div>

      {/* Center stage: keyline ring + lock */}
      <div className="absolute inset-0 grid place-items-center px-6">
        {/* Outer keyline that draws around the lock */}
        <motion.svg
          viewBox="0 0 220 220"
          className="absolute"
          style={{ width: "min(60vw, 220px)", height: "min(60vw, 220px)" }}
          initial={{ opacity: 0, rotate: -20 }}
          animate={{ opacity: [0, 1, 1, 0], rotate: 0 }}
          transition={{ duration: 1.3, times: [0, 0.25, 0.75, 1] }}
        >
          <defs>
            <linearGradient id="lumina-keyline" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.92 0.14 85)" />
              <stop offset="55%" stopColor="oklch(0.78 0.18 320)" />
              <stop offset="100%" stopColor="oklch(0.65 0.22 285)" />
            </linearGradient>
          </defs>
          <motion.circle
            cx="110"
            cy="110"
            r="92"
            fill="none"
            stroke="url(#lumina-keyline)"
            strokeWidth="1.25"
            strokeDasharray="580"
            initial={{ strokeDashoffset: 580 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.circle
            cx="110"
            cy="110"
            r="76"
            fill="none"
            stroke="oklch(0.95 0.05 85 / 0.35)"
            strokeWidth="0.75"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: [0.85, 1.05, 1], opacity: [0, 0.8, 0] }}
            transition={{ duration: 1.1, delay: 0.4 }}
            style={{ transformOrigin: "110px 110px" }}
          />
        </motion.svg>

        {/* Glow halo behind the lock */}
        <motion.div
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: [0.3, 1.1, 3.2], opacity: [0, 0.9, 0] }}
          transition={{ duration: 1.1, delay: 0.35, ease: "easeOut" }}
          className="rounded-full"
          style={{
            width: "min(40vw, 160px)",
            height: "min(40vw, 160px)",
            background:
              "radial-gradient(closest-side, oklch(0.92 0.14 85 / 0.85), oklch(0.7 0.2 320 / 0.35) 55%, transparent 78%)",
            filter: "blur(4px)",
          }}
        />

        {/* Lock icon: materialize, gentle unlock rotation, then fade */}
        <motion.div
          initial={{ opacity: 0, scale: 0.6, y: 6 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1, 1.08, 1.25], rotate: [0, 0, -12, -12] }}
          transition={{ duration: 1.3, times: [0, 0.3, 0.7, 1], ease: "easeOut" }}
          className="absolute grid place-items-center rounded-2xl"
          style={{
            width: "min(18vw, 80px)",
            height: "min(18vw, 80px)",
            background:
              "linear-gradient(135deg, oklch(0.22 0.05 290 / 0.85), oklch(0.14 0.04 280 / 0.85))",
            boxShadow:
              "0 20px 60px -20px oklch(0.55 0.22 300 / 0.65), inset 0 1px 0 oklch(1 0 0 / 0.15)",
            backdropFilter: "blur(6px)",
          }}
        >
          <Lock className="h-7 w-7 text-[oklch(0.95_0.08_85)] sm:h-8 sm:w-8" />
        </motion.div>

        {/* Whispered label */}
        <motion.div
          initial={{ opacity: 0, y: 14, letterSpacing: "0.6em" }}
          animate={{ opacity: [0, 1, 1, 0], y: [14, 0, 0, -6], letterSpacing: ["0.6em", "0.4em", "0.4em", "0.5em"] }}
          transition={{ duration: 1.3, delay: 0.45, times: [0, 0.25, 0.75, 1] }}
          className="absolute top-[70%] whitespace-nowrap font-display text-[10px] uppercase text-[oklch(0.95_0.08_85)]/90 sm:top-[64%] sm:text-[11px]"
          style={{ textShadow: "0 0 20px oklch(0.75 0.18 300 / 0.6)" }}
        >
          your quiet space
        </motion.div>
      </div>

      {/* Final aperture: bright bloom then dissolves */}
      <motion.div
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0, 0.85, 0], scale: [0.2, 0.2, 3.6, 4] }}
        transition={{ duration: 1.4, times: [0, 0.55, 0.85, 1], ease: "easeOut" }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: "min(70vw, 256px)",
          height: "min(70vw, 256px)",
          background:
            "radial-gradient(closest-side, oklch(1 0 0 / 0.95), oklch(0.92 0.14 85 / 0.5) 40%, transparent 75%)",
          filter: "blur(3px)",
        }}
      />
    </motion.div>
  );
}
