// Farewell — Ritual Entry.
//
// This is the emotional climax entry point. Not a form. A dark cinematic
// room with a single warm paper letter floating in candlelight, an
// integrated voice memory, and a single glowing release. Pressing
// release plays a short local pre-ritual (button → ember, paper lifts,
// camera zoom, ambient fade) and then hands off to the existing
// FarewellScene which owns MatchFire, the burn shader, and the timeline.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Flame } from "lucide-react";
import { createCustomFarewellWithId } from "@/lib/farewell/entities";


export const Route = createFileRoute("/app/farewell/custom")({
  ssr: false,
  component: CustomPage,
});

function CustomPage() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [releasing, setReleasing] = useState(false);

  // Stable draft id so a voice memory recorded on the Farewell home card
  // carries through to this writer, and so voice recorded here survives
  // until release. Shared via sessionStorage under DRAFT_KEY.
  const DRAFT_KEY = "lumina-farewell-draft-id";
  const draftIdRef = useRef<string>("");
  if (!draftIdRef.current) {
    if (typeof window !== "undefined") {
      const existing = window.sessionStorage.getItem(DRAFT_KEY);
      draftIdRef.current = existing || "c_" + Math.random().toString(36).slice(2, 10);
      window.sessionStorage.setItem(DRAFT_KEY, draftIdRef.current);
    } else {
      draftIdRef.current = "c_" + Math.random().toString(36).slice(2, 10);
    }
  }
  const draftId = draftIdRef.current;

  const canRelease = body.trim().length > 0;

  const onRelease = () => {
    if (!canRelease || releasing) return;
    setReleasing(true);
    createCustomFarewellWithId(draftId, title, body);
    if (typeof window !== "undefined") window.sessionStorage.removeItem(DRAFT_KEY);
    // Local cinematic pre-ritual runs for ~1.6s, then hand off. The
    // FarewellScene owns match, burn, ashes — we don't touch those.
    window.setTimeout(() => {
      navigate({
        to: "/app/farewell/$entity/$id",
        params: { entity: "custom", id: draftId },
        search: { ritual: "fire" },
      });
    }, 1600);
  };

  // Escape closes the ritual room. Trapping the user behind fixed inset-0
  // with only a small "Back" link isn't accessible — Esc mirrors the
  // implicit "cancel" affordance every modal has.
  useEffect(() => {
    if (releasing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        navigate({ to: "/app/farewell" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, releasing]);

  return (
    <div
      className="fixed inset-0 z-40 overflow-hidden bg-[#07050a] text-white"
      style={{ touchAction: "manipulation" }}
      role="dialog"
      aria-modal="true"
      aria-label="Write a farewell"
    >
      {/* Ambient layers — gated behind reduced-motion so the ritual room
          becomes a still, silent still-life for users who opt out. */}
      {!reduced && (
        <>
          <CandleGlow />
          <DustParticles />
          <Embers />
          <SmokeDrift />
        </>
      )}
      <Vignette />

      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] sm:px-6 sm:py-4">
        <Link
          to="/app/farewell"
          aria-label="Back to Farewell"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 py-2 text-[11px] uppercase tracking-[0.28em] text-white/70 transition hover:text-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <div className="text-[10px] uppercase tracking-[0.32em] text-white/60">
          A Quiet Ritual
        </div>
        <div className="w-10" />
      </div>

      {/* Cinematic stage — the whole content pans/zooms during release */}
      <motion.div
        animate={
          releasing
            ? { scale: 1.06, y: -18, filter: "brightness(0.85)" }
            : { scale: 1, y: 0, filter: "brightness(1)" }
        }
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-[1] flex h-full w-full items-center justify-center overflow-y-auto px-4 py-16 sm:py-20"
        style={{ transformOrigin: "50% 55%" }}
      >
        <div className="flex w-full max-w-xl flex-col items-center">
          {/* Whisper prompt */}
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: releasing ? 0 : 1, y: 0 }}
            transition={{ duration: 1.1, delay: releasing ? 0 : 0.15 }}
            className="mb-6 text-center font-display text-[15px] italic text-white/55"
          >
            Sit with it once more. Write what you're letting go.
          </motion.p>

          {/* The paper letter */}
          <PaperLetter
            releasing={releasing}
            title={title}
            body={body}
            onTitleChange={setTitle}
            onBodyChange={setBody}
          />


          {/* Release */}
          <ReleaseButton
            disabled={!canRelease}
            releasing={releasing}
            onClick={onRelease}
          />

          {/* Whisper caption — explains why release is dimmed when the
              body is empty, so the ember never feels broken. */}
          <AnimatePresence>
            {!canRelease && !releasing && (
              <motion.p
                key="release-hint"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="mt-2 text-center text-[11px] italic text-white/50"
                aria-live="polite"
              >
                Write something first.
              </motion.p>
            )}
          </AnimatePresence>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: releasing ? 0 : 1 }}
            transition={{ duration: 0.6 }}
            className="mt-4 max-w-sm text-center text-[11px] leading-relaxed text-white/35"
          >
            Nothing is written to Notes. Nothing is deleted until the flame settles.
          </motion.p>
        </div>
      </motion.div>

      {/* Curtain fade when the ritual hands off */}
      <AnimatePresence>
        {releasing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, delay: 0.2 }}
            className="pointer-events-none absolute inset-0 z-20 bg-black"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------------------------------------- */
/* The paper letter                                                */
/* --------------------------------------------------------------- */

function PaperLetter({
  releasing,
  title,
  body,
  onTitleChange,
  onBodyChange,
}: {
  releasing: boolean;
  title: string;
  body: string;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: -0.4 }}
      animate={
        releasing
          ? { opacity: 0.9, y: -60, rotate: -0.8, scale: 1.02 }
          : { opacity: 1, y: 0, rotate: -0.4 }
      }
      transition={{ duration: releasing ? 1.5 : 1.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-[min(100%,32rem)]"
    >
      {/* Slow breathing sway */}
      <motion.div
        animate={{ y: [0, -4, 0, 3, 0], rotate: [-0.4, 0.1, -0.3, 0.2, -0.4] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        {/* Soft warm floor shadow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-8 left-1/2 h-10 w-[85%] -translate-x-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(50% 50% at 50% 50%, oklch(0.2 0.05 40 / .55), transparent 70%)",
            filter: "blur(10px)",
          }}
        />

        {/* Paper surface */}
        <div
          className="relative overflow-hidden px-8 py-9 sm:px-10 sm:py-11"
          style={{
            borderRadius: "6px 10px 8px 12px",
            background:
              "radial-gradient(120% 90% at 30% 10%, oklch(0.96 0.03 82), oklch(0.9 0.05 78) 60%, oklch(0.83 0.06 70) 100%)",
            boxShadow: [
              "0 30px 60px -30px oklch(0.15 0.08 40 / .8)",
              "0 8px 22px -12px oklch(0.15 0.08 40 / .55)",
              "inset 0 0 60px oklch(0.55 0.14 50 / .12)",
              "inset 0 0 0 1px oklch(0.7 0.08 65 / .35)",
            ].join(", "),
          }}
        >
          {/* Paper grain */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-multiply"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.15  0 0 0 0.35 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
            }}
          />

          {/* Warm inner glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 100%, oklch(0.85 0.15 55 / .35), transparent 70%)",
              mixBlendMode: "multiply",
            }}
          />

          {/* Curled top-right corner */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-1 h-10 w-10"
            style={{
              background:
                "linear-gradient(225deg, oklch(0.78 0.06 60) 0%, oklch(0.86 0.05 70) 45%, transparent 55%)",
              clipPath: "polygon(100% 0, 100% 100%, 0 0)",
              filter: "drop-shadow(-2px 2px 3px oklch(0.2 0.05 40 / .35))",
              borderRadius: "0 6px 0 0",
            }}
          />
          {/* Curled bottom-left corner */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-1 -left-1 h-8 w-8"
            style={{
              background:
                "linear-gradient(45deg, oklch(0.78 0.06 60) 0%, oklch(0.86 0.05 70) 45%, transparent 55%)",
              clipPath: "polygon(0 0, 0 100%, 100% 100%)",
              filter: "drop-shadow(2px -2px 3px oklch(0.2 0.05 40 / .35))",
              borderRadius: "0 0 0 6px",
            }}
          />

          {/* Title line */}
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="A quiet name…"
            disabled={releasing}
            aria-label="Farewell title"
            className={`paper-ink-input relative z-[1] block w-full border-0 border-b border-dashed border-[oklch(0.45_0.08_45_/_.35)] bg-transparent pb-2 font-display text-xl tracking-tight text-[oklch(0.28_0.06_35)] outline-none transition-opacity focus:border-[oklch(0.4_0.1_40_/_.7)] ${releasing ? "opacity-70" : ""}`}
          />

          {/* Body — ink on paper */}
          <textarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="Write freely.
When you're ready, we'll let it go…"
            rows={8}
            disabled={releasing}
            aria-label="What you're letting go of"
            className={`paper-ink-input paper-ink-input--italic relative z-[1] mt-3 block w-full resize-none border-0 bg-transparent p-0 font-display text-[17px] leading-[1.9] tracking-tight text-[oklch(0.24_0.06_32)] outline-none transition-opacity ${releasing ? "opacity-70" : ""}`}
            style={{
              caretColor: "oklch(0.35 0.1 35)",
              // subtle ruled lines
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0, transparent calc(1.9em - 1px), oklch(0.4 0.06 45 / .1) calc(1.9em - 1px), oklch(0.4 0.06 45 / .1) 1.9em)",
              backgroundPosition: "0 0.35em",
            }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

/* --------------------------------------------------------------- */
/* Release button — ember morph                                     */
/* --------------------------------------------------------------- */

function ReleaseButton({
  disabled,
  releasing,
  onClick,
}: {
  disabled: boolean;
  releasing: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mt-8 flex h-16 items-center justify-center">
      <AnimatePresence mode="wait">
        {!releasing ? (
          <motion.button
            key="btn"
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.2 }}
            transition={{ duration: 0.5 }}
            onClick={onClick}
            disabled={disabled}
            aria-disabled={disabled}
            aria-label={disabled ? "Release (write something first)" : "Begin the ritual and release"}
            className="group relative inline-flex items-center gap-2.5 rounded-full px-7 py-3 text-sm font-medium tracking-wide text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.85_0.16_55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07050a] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.72 0.2 45) 0%, oklch(0.55 0.22 28) 100%)",
              boxShadow:
                "0 0 0 1px oklch(0.85 0.15 55 / .35), 0 12px 40px -10px oklch(0.6 0.24 35 / .7), 0 0 60px -8px oklch(0.75 0.22 45 / .55)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-70 blur-xl"
              style={{
                background:
                  "radial-gradient(50% 50% at 50% 50%, oklch(0.78 0.22 45 / .6), transparent 70%)",
              }}
            />
            <Flame className="h-4 w-4" />
            Begin the Ritual
          </motion.button>
        ) : (
          <motion.div
            key="ember"
            initial={{ scale: 1, opacity: 1 }}
            animate={{
              scale: [1, 0.35, 0.15, 0],
              opacity: [1, 1, 0.7, 0],
              y: [0, -14, -34, -60],
            }}
            transition={{ duration: 1.5, ease: "easeOut", times: [0, 0.35, 0.7, 1] }}
            className="h-4 w-4 rounded-full"
            style={{
              background:
                "radial-gradient(circle, oklch(0.95 0.18 70) 0%, oklch(0.72 0.22 40) 60%, transparent 100%)",
              boxShadow:
                "0 0 30px 8px oklch(0.75 0.22 40 / .7), 0 0 60px 20px oklch(0.7 0.22 35 / .35)",
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------------------------------------- */
/* Ambient layers                                                   */
/* --------------------------------------------------------------- */

function CandleGlow() {
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[110vh] w-[110vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.65 0.2 55 / .28), oklch(0.45 0.18 40 / .12) 45%, transparent 75%)",
        }}
        animate={{ opacity: [0.85, 1, 0.9, 1, 0.88], scale: [1, 1.03, 1, 1.02, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20vh] left-1/2 h-[70vh] w-[120vh] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.55 0.22 40 / .35), transparent 70%)",
          filter: "blur(20px)",
        }}
        animate={{ opacity: [0.6, 0.8, 0.7, 0.85, 0.65] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

function Vignette() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[2]"
      style={{
        background:
          "radial-gradient(120% 100% at 50% 50%, transparent 50%, oklch(0.05 0.02 30 / .85) 100%)",
      }}
    />
  );
}

function DustParticles() {
  const dust = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1 + Math.random() * 2.2,
        drift: (Math.random() - 0.5) * 60,
        rise: 40 + Math.random() * 80,
        delay: Math.random() * 8,
        duration: 18 + Math.random() * 20,
        opacity: 0.15 + Math.random() * 0.35,
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {dust.map((d) => (
        <motion.span
          key={d.id}
          className="absolute rounded-full bg-[oklch(0.95_0.05_70)]"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            boxShadow: "0 0 6px oklch(0.85 0.1 60 / .6)",
            opacity: d.opacity,
          }}
          animate={{
            y: [0, -d.rise],
            x: [0, d.drift, 0],
            opacity: [0, d.opacity, 0],
          }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function Embers() {
  const embers = useMemo(
    () =>
      Array.from({ length: 10 }).map((_, i) => ({
        id: i,
        left: 25 + Math.random() * 50,
        size: 2 + Math.random() * 3,
        drift: (Math.random() - 0.5) * 90,
        rise: 60 + Math.random() * 40,
        delay: Math.random() * 10,
        duration: 12 + Math.random() * 10,
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {embers.map((e) => (
        <motion.span
          key={e.id}
          className="absolute rounded-full"
          style={{
            left: `${e.left}%`,
            bottom: "-4vh",
            width: e.size,
            height: e.size,
            background:
              "radial-gradient(circle, oklch(0.92 0.18 65) 0%, oklch(0.68 0.22 35) 60%, transparent 100%)",
            boxShadow: "0 0 10px oklch(0.75 0.22 40 / .7)",
          }}
          animate={{
            y: [0, `-${e.rise}vh`],
            x: [0, e.drift, e.drift * 0.4],
            opacity: [0, 0.9, 0.6, 0],
          }}
          transition={{
            duration: e.duration,
            delay: e.delay,
            repeat: Infinity,
            ease: "easeOut",
            times: [0, 0.2, 0.7, 1],
          }}
        />
      ))}
    </div>
  );
}

function SmokeDrift() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-[20%] z-0 h-[60vh] opacity-[.25]"
      style={{
        background:
          "radial-gradient(60% 40% at 30% 40%, oklch(0.85 0.02 60 / .35), transparent 70%), radial-gradient(50% 40% at 70% 60%, oklch(0.8 0.03 55 / .3), transparent 70%)",
        filter: "blur(30px)",
      }}
      animate={{ x: [-40, 40, -30, 30, -40], y: [0, -12, 6, -8, 0] }}
      transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
