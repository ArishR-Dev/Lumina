import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  PenLine,
  ChevronRight,
  Mic,
  Check,
  RefreshCw,
  Trash2,
  Flame,
  ArrowLeft,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/lumina/PageHeader";
import {
  ENTITY_META,
  PICKABLE_KINDS,
  createCustomFarewellWithId,
  readCustomFarewell,
  type EntityKind,
} from "@/lib/farewell/entities";
import { deleteVoice, loadVoice, type VoiceRecord } from "@/lib/farewell/voice";

export const Route = createFileRoute("/app/farewell/")({ component: FarewellHome });

const DRAFT_KEY = "lumina-farewell-draft-id";

function makeDraftId() {
  return "c_" + Math.random().toString(36).slice(2, 10);
}

function FarewellHome() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  // Shared draft id so a voice recorded on /voice and text written on
  // /custom refer to the same pending farewell. Read from sessionStorage
  // inside an effect to avoid an SSR/hydration mismatch on this route
  // (index is not ssr:false).
  const [draftId, setDraftId] = useState<string>("");
  useEffect(() => {
    const existing = window.sessionStorage.getItem(DRAFT_KEY);
    const id = existing || makeDraftId();
    if (!existing) window.sessionStorage.setItem(DRAFT_KEY, id);
    setDraftId(id);
  }, []);

  const [voice, setVoice] = useState<VoiceRecord | null>(null);
  useEffect(() => {
    if (!draftId) return;
    setVoice(loadVoice("custom", draftId));
    // Re-check on tab focus / visibility so returning from /voice reflects
    // new state. `visibilitychange` fires more reliably than `focus` on
    // iOS PWAs.
    const onFocus = () => setVoice(loadVoice("custom", draftId));
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [draftId]);


  const onBeginRitualVoiceOnly = () => {
    if (!draftId) return;
    // Voice attaches to the shared farewell draft. The scene detects the
    // "voice-only" state (empty title + empty content + attached voice)
    // and renders a dedicated Voice Farewell paper with a real waveform.
    const existing = readCustomFarewell(draftId);
    if (!existing) createCustomFarewellWithId(draftId, "", "");
    window.sessionStorage.removeItem(DRAFT_KEY);
    navigate({
      to: "/app/farewell/$entity/$id",
      params: { entity: "custom", id: draftId },
      search: { ritual: "fire" },
    });
  };

  const removeVoice = () => {
    deleteVoice("custom", draftId);
    setVoice(null);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/app"
        aria-label="Back"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-4 py-2.5 text-xs font-medium uppercase tracking-widest text-muted-foreground backdrop-blur transition hover:-translate-y-0.5 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/10 dark:bg-white/5"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back
      </Link>
      <PageHeader
        eyebrow="A Quiet Ritual"
        title="Farewell"
        subtitle="A space to let go, gently. Choose something to release — or write, or speak, something new for this moment alone."
      />

      {/* Primary hero — dual expression card, warm sanctuary lighting */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-10 overflow-hidden rounded-[28px] p-7 sm:p-10"
        style={{
          background:
            "radial-gradient(60% 80% at 20% 100%, oklch(0.68 0.22 35 / .5), transparent 65%), radial-gradient(70% 80% at 90% 0%, oklch(0.5 0.22 15 / .55), transparent 65%), linear-gradient(135deg, oklch(0.96 0.03 60) 0%, oklch(0.92 0.05 40) 100%)",
          boxShadow: "0 24px 60px -22px oklch(0.5 0.22 30 / .6), inset 0 1px 0 oklch(1 0 0 / .5)",
        }}
      >
        {!reduced && (
          <>
            {/* Moving warm-light gradient sweep */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0.55 }}
              animate={{
                background: [
                  "radial-gradient(35% 45% at 25% 40%, oklch(0.85 0.2 55 / .35), transparent 70%)",
                  "radial-gradient(45% 55% at 70% 55%, oklch(0.75 0.22 30 / .35), transparent 70%)",
                  "radial-gradient(40% 50% at 40% 30%, oklch(0.8 0.2 45 / .35), transparent 70%)",
                  "radial-gradient(35% 45% at 25% 40%, oklch(0.85 0.2 55 / .35), transparent 70%)",
                ],
              }}
              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Floating embers */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              {[
                { l: "12%", size: 4, dur: 7.5, delay: 0 },
                { l: "28%", size: 3, dur: 9, delay: 1.3 },
                { l: "44%", size: 5, dur: 8, delay: 2.6 },
                { l: "62%", size: 3, dur: 10, delay: 0.8 },
                { l: "78%", size: 4, dur: 8.5, delay: 3.2 },
                { l: "90%", size: 3, dur: 9.5, delay: 1.9 },
              ].map((e, i) => (
                <motion.span
                  key={i}
                  className="absolute bottom-[-8px] rounded-full"
                  style={{
                    left: e.l,
                    width: e.size,
                    height: e.size,
                    background: "radial-gradient(circle, oklch(0.85 0.22 55 / .95) 0%, oklch(0.65 0.24 35 / .7) 55%, transparent 100%)",
                    boxShadow: "0 0 8px oklch(0.75 0.24 40 / .8)",
                  }}
                  initial={{ y: 0, opacity: 0 }}
                  animate={{
                    y: [0, -180, -320],
                    x: [0, 10, -8, 12],
                    opacity: [0, 0.9, 0.5, 0],
                  }}
                  transition={{
                    duration: e.dur,
                    repeat: Infinity,
                    delay: e.delay,
                    ease: "easeOut",
                  }}
                />
              ))}
            </div>

            {/* Twinkling particles */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {[
                { top: "18%", left: "82%", d: 3.5 },
                { top: "34%", left: "10%", d: 4.2 },
                { top: "68%", left: "72%", d: 3.8 },
                { top: "22%", left: "48%", d: 4.6 },
              ].map((p, i) => (
                <motion.span
                  key={i}
                  className="absolute h-1 w-1 rounded-full bg-white"
                  style={{ top: p.top, left: p.left, boxShadow: "0 0 6px oklch(1 0 0 / .8)" }}
                  animate={{ opacity: [0.15, 0.9, 0.15], scale: [0.7, 1.2, 0.7] }}
                  transition={{ duration: p.d, repeat: Infinity, ease: "easeInOut" }}
                />
              ))}
            </div>
          </>
        )}

        <div className="relative">
          <div className="text-[10px] uppercase tracking-[0.32em]" style={{ color: "oklch(0.42 0.14 35)" }}>
            Begin
          </div>
          <h2
            className="mt-2 font-display text-[2rem] leading-[1.05] tracking-tight sm:text-[2.75rem]"
            style={{ color: "#2E241C" }}
          >
            Write something to release
          </h2>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed" style={{ color: "#6A5A50" }}>
            Put it into words, or speak it aloud. Nothing you leave here is saved to Notes.
          </p>

          {/* Dual primary actions */}
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BreathingPill
              to="/app/farewell/custom"
              gradient="linear-gradient(135deg, oklch(0.75 0.2 55) 0%, oklch(0.6 0.22 35) 55%, oklch(0.5 0.22 25) 100%)"
              glow="oklch(0.7 0.22 40 / .55)"
              icon={<PenLine className="h-4 w-4" />}
              label="Write"
            />
            {voice ? (
              <VoiceReadyCard voice={voice} onRemove={removeVoice} />
            ) : (
              <BreathingPill
                to="/app/farewell/voice"
                gradient="linear-gradient(135deg, oklch(0.55 0.22 15) 0%, oklch(0.42 0.2 10) 55%, oklch(0.32 0.16 15) 100%)"
                glow="oklch(0.5 0.24 15 / .55)"
                icon={<Mic className="h-4 w-4" />}
                label="Record Voice"
              />
            )}
          </div>

          {/* Begin Ritual — voice-only shortcut */}
          <AnimatePresence>
            {voice && (
              <motion.button
                key="begin"
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                onClick={onBeginRitualVoiceOnly}
                className="group mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-br from-[oklch(0.72_0.2_40)] to-[oklch(0.45_0.22_20)] px-6 py-3 text-sm font-medium text-white shadow-[0_14px_36px_-14px_oklch(0.5_0.22_25_/_.85)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.85_0.16_55)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0"
              >
                <Flame className="h-4 w-4" /> Begin Ritual
                <ChevronRight className="h-4 w-4 -mr-1 transition group-hover:translate-x-0.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>


      {/* Release Existing */}
      <section>
        <div className="mb-1 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          Release something you've kept
        </div>
        <p className="mb-4 max-w-lg text-sm text-muted-foreground">
          Choose a collection to browse.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PICKABLE_KINDS.map((kind) => (
            <CategoryCard key={kind} kind={kind} />
          ))}
        </div>
      </section>

      <p className="mx-auto mt-12 max-w-md text-center text-[13px] leading-relaxed text-muted-foreground">
        The ritual is slow on purpose. Nothing is deleted until the flame settles —
        if you step away, close the tab, or change your mind, everything remains.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- */
/* Breathing pill — shared shell for Write / Voice CTAs             */
/* --------------------------------------------------------------- */

function BreathingPill({
  to,
  gradient,
  glow,
  icon,
  label,
}: {
  to: "/app/farewell/custom" | "/app/farewell/voice";
  gradient: string;
  glow: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      animate={{
        boxShadow: [
          `0 12px 30px -14px ${glow}, 0 0 0 0 ${glow}`,
          `0 16px 38px -14px ${glow}, 0 0 24px 2px ${glow}`,
          `0 12px 30px -14px ${glow}, 0 0 0 0 ${glow}`,
        ],
      }}
      transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      className="relative rounded-full"
      style={{ background: gradient }}
    >
      <Link
        to={to}
        className="relative flex h-14 items-center justify-center gap-2.5 rounded-full px-6 text-[15px] font-medium text-white no-underline"
      >
        {icon}
        {label}
      </Link>
    </motion.div>
  );
}

/* --------------------------------------------------------------- */
/* Voice ready card — replaces the mic CTA once a recording exists  */
/* --------------------------------------------------------------- */

function VoiceReadyCard({
  voice,
  onRemove,
}: {
  voice: VoiceRecord;
  onRemove: () => void;
}) {
  const secs = Math.max(0, Math.round(voice.duration || 0));
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toString().padStart(2, "0");
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative flex h-14 items-center gap-3 overflow-hidden rounded-full px-4 text-white"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.5 0.22 15) 0%, oklch(0.35 0.18 12) 100%)",
        boxShadow: "0 14px 34px -14px oklch(0.5 0.24 15 / .55)",
      }}
    >
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/95 text-[oklch(0.4_0.2_20)]"
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <div className="flex flex-1 flex-col leading-tight">
        <span className="text-[13px] font-medium">Voice Memory Ready</span>
        <span className="text-[11px] text-white/70 tabular-nums">
          {m}:{s} recorded
        </span>
      </div>
      <Link
        to="/app/farewell/voice"
        aria-label="Re-record voice memory"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </Link>
      <button
        type="button"
        aria-label="Delete voice memory"
        onClick={onRemove}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

/* --------------------------------------------------------------- */
/* Category card                                                    */
/* --------------------------------------------------------------- */

function CategoryCard({ kind }: { kind: EntityKind }) {
  const meta = ENTITY_META[kind];
  return (
    <Link
      to="/app/farewell/pick/$category"
      params={{ category: kind }}
      className="group relative overflow-hidden rounded-3xl border border-white/60 bg-white/60 p-4 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
    >
      <div className="flex items-start justify-between">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[oklch(0.94_0.08_60_/_.7)] to-[oklch(0.9_0.12_35_/_.5)] text-xl">
          {meta.emoji}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 font-display text-lg text-foreground">{meta.plural}</div>
      <div className="text-[12px] leading-snug text-muted-foreground">{meta.hint}</div>
    </Link>
  );
}
