// Premium desktop sidebar entry for the Farewell ritual.
//
// Design intent: not another nav item. A hidden, ceremonial card that
// invites the user in. Everything visual is CSS animation — no React
// state updates, no rAF, no framer-motion springs — so it costs nothing
// while it's on screen.

import { Link } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { memo } from "react";

const STYLE_ID = "farewell-entry-style";
const KEYFRAMES = `
@keyframes farewell-breath {
  0%, 100% { transform: translateY(0) scale(1); }
  50%      { transform: translateY(-2px) scale(1.012); }
}
@keyframes farewell-glow {
  0%, 100% { opacity: .55; filter: blur(18px); }
  50%      { opacity: .85; filter: blur(22px); }
}
@keyframes farewell-flicker {
  0%, 100% { opacity: .82; transform: translate(-50%,-50%) scale(1); }
  20%      { opacity: 1;   transform: translate(-50%,-50%) scale(1.06); }
  45%      { opacity: .72; transform: translate(-50%,-50%) scale(.96); }
  70%      { opacity: .95; transform: translate(-50%,-50%) scale(1.04); }
}
@keyframes farewell-ember {
  0%   { transform: translateY(0)   translateX(0)   scale(1);   opacity: 0; }
  15%  { opacity: .9; }
  100% { transform: translateY(-46px) translateX(var(--fx, 6px)) scale(.4); opacity: 0; }
}
@keyframes farewell-sparkle {
  0%, 92%, 100% { opacity: 0; transform: scale(.6); }
  95%           { opacity: 1; transform: scale(1); }
}
@keyframes farewell-sweep {
  0%   { transform: translateX(-120%) skewX(-14deg); opacity: 0; }
  20%  { opacity: .5; }
  100% { transform: translateX(220%)  skewX(-14deg); opacity: 0; }
}
/* Breath animation lives on an inner wrapper (.fw-breath) so the anchor
   itself stays stable — perpetually-animating anchors defeat automated
   click stability checks (Playwright) and are harder to hit for users. */
.farewell-card .fw-breath { animation: farewell-breath 6.5s ease-in-out infinite; }
.farewell-card .fw-glow    { animation: farewell-glow 5.5s ease-in-out infinite; }
.farewell-card .fw-flame   { animation: farewell-flicker 2.6s ease-in-out infinite; }
.farewell-card .fw-ember-1 { animation: farewell-ember 5.5s ease-in 0.4s infinite; --fx: -8px; }
.farewell-card .fw-ember-2 { animation: farewell-ember 6.8s ease-in 1.9s infinite; --fx: 10px; }
.farewell-card .fw-ember-3 { animation: farewell-ember 6.2s ease-in 3.3s infinite; --fx: -4px; }
.farewell-card .fw-sparkle-1 { animation: farewell-sparkle 7s ease-in-out 1.2s infinite; }
.farewell-card .fw-sparkle-2 { animation: farewell-sparkle 9s ease-in-out 4.4s infinite; }
.farewell-card .fw-sweep    { transform: translateX(-120%) skewX(-14deg); }
.farewell-card:hover .fw-sweep { animation: farewell-sweep 1.4s ease-out 1; }
.farewell-card:hover .fw-glow  { opacity: 1 !important; filter: blur(26px) !important; }
.farewell-card:hover .fw-breath { transform: translateY(-3px) scale(1.015); transition: transform .35s cubic-bezier(.22,1,.36,1); }
/* Mobile / reduced-intensity variant: ~20% slower + softer glow */
.farewell-card[data-intensity="reduced"] .fw-breath   { animation-duration: 8s; }
.farewell-card[data-intensity="reduced"] .fw-glow     { animation-duration: 6.8s; opacity: .48; }
.farewell-card[data-intensity="reduced"] .fw-flame    { animation-duration: 3.2s; }
.farewell-card[data-intensity="reduced"] .fw-ember-1  { animation-duration: 6.8s; }
.farewell-card[data-intensity="reduced"] .fw-ember-2  { animation-duration: 8.4s; }
.farewell-card[data-intensity="reduced"] .fw-ember-3  { animation-duration: 7.6s; }
.farewell-card[data-intensity="reduced"] .fw-sparkle-1{ animation-duration: 8.6s; }
.farewell-card[data-intensity="reduced"] .fw-sparkle-2{ animation-duration: 11s; }
`;

function ensureStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = KEYFRAMES;
  document.head.appendChild(el);
}

function FarewellEntryInner({
  collapsed,
  onNavigate,
  reduceMotion,
  featured,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  reduceMotion?: boolean;
  featured?: boolean;
}) {
  ensureStyle();

  if (collapsed) {
    // Collapsed sidebar: a small glowing flame chip that still reads as
    // "something special" without the full ceremonial card.
    return (
      <Link
        to="/app/farewell"
        className="farewell-card group relative mx-auto grid h-12 w-12 place-items-center rounded-2xl"
        aria-label="Begin farewell ritual"
        title="A quiet ritual"
      >
        <span className="fw-breath pointer-events-none absolute inset-0 grid place-items-center">
          <span className="fw-glow pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_60%,oklch(0.72_0.18_35_/_.85),oklch(0.55_0.22_320_/_.55)_60%,transparent_75%)]" />
          <span
            className="pointer-events-none absolute inset-0 rounded-2xl border"
            style={{ borderColor: "color-mix(in oklab, oklch(0.82 0.14 85) 60%, transparent)" }}
          />
          <span className="pointer-events-none absolute inset-[3px] rounded-[14px] bg-white/40 backdrop-blur-md dark:bg-white/10" />
          <span className="fw-flame relative z-10 grid place-items-center text-[oklch(0.58_0.2_35)]">
            <Flame className="h-5 w-5" />
          </span>
        </span>
      </Link>
    );
  }

  const dataIntensity = reduceMotion ? "reduced" : undefined;


  return (
    <Link
      to="/app/farewell"
      onClick={onNavigate}
      aria-label="Begin farewell ritual"
      data-intensity={dataIntensity}
      className="farewell-card group relative block w-full overflow-hidden rounded-2xl no-underline"
      style={{
        // Warm shadow + faint gold border via layered box-shadow. Cheap;
        // no filter / backdrop-filter beyond the inner glass panel.
        boxShadow:
          "0 10px 28px -14px color-mix(in oklab, oklch(0.55 0.22 30) 55%, transparent), 0 2px 0 0 color-mix(in oklab, oklch(0.85 0.14 85) 35%, transparent) inset",
        minHeight: featured ? 160 : undefined,
      }}
    >
      {/* Soft purple/ember halo behind the card */}
      <span
        aria-hidden
        className="fw-glow pointer-events-none absolute -inset-2 -z-0 rounded-3xl"
        style={{
          background:
            "radial-gradient(60% 70% at 30% 100%, oklch(0.62 0.22 35 / .55), transparent 70%), radial-gradient(70% 80% at 80% 0%, oklch(0.55 0.22 320 / .55), transparent 65%)",
        }}
      />

      {/* Glass panel */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl bg-white/40 backdrop-blur-xl dark:bg-white/[0.06]"
      />
      {/* Faint gold hairline */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl border transition-colors duration-500 group-hover:border-[color:oklch(0.82_0.16_75_/_.85)]"
        style={{ borderColor: "color-mix(in oklab, oklch(0.85 0.14 85) 45%, transparent)" }}
      />

      {/* Light sweep on hover */}
      <span
        aria-hidden
        className="fw-sweep pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/15"
      />

      {/* Drifting embers */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <span
          className="fw-ember-1 absolute bottom-3 left-6 h-1 w-1 rounded-full"
          style={{ background: "oklch(0.85 0.16 55)", boxShadow: "0 0 8px oklch(0.78 0.18 45)" }}
        />
        <span
          className="fw-ember-2 absolute bottom-4 left-14 h-[3px] w-[3px] rounded-full"
          style={{ background: "oklch(0.88 0.15 50)", boxShadow: "0 0 10px oklch(0.72 0.2 40)" }}
        />
        <span
          className="fw-ember-3 absolute bottom-3 right-10 h-1 w-1 rounded-full"
          style={{ background: "oklch(0.82 0.16 65)", boxShadow: "0 0 8px oklch(0.72 0.2 45)" }}
        />
        <span
          className="fw-sparkle-1 absolute right-4 top-3 h-[3px] w-[3px] rounded-full"
          style={{ background: "oklch(0.95 0.05 90)", boxShadow: "0 0 8px oklch(0.9 0.1 80)" }}
        />
        <span
          className="fw-sparkle-2 absolute left-4 top-6 h-[2px] w-[2px] rounded-full"
          style={{ background: "oklch(0.95 0.05 320)", boxShadow: "0 0 8px oklch(0.85 0.12 320)" }}
        />
      </span>

      {/* Content */}
      <span className="fw-breath relative z-10 flex flex-col gap-2 p-3.5">
        <span className="flex items-center gap-2">
          <span className="relative grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.7_0.2_35_/_.35)] to-[oklch(0.55_0.22_320_/_.3)]">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: "inset 0 0 0 1px color-mix(in oklab, oklch(0.85 0.14 85) 55%, transparent)" }}
            />
            <span className="fw-flame text-[oklch(0.6_0.22_35)]">
              <Flame className="h-3.5 w-3.5" />
            </span>
          </span>
          <span className="text-[9px] uppercase tracking-[0.28em] text-[oklch(0.5_0.14_35)] dark:text-[oklch(0.82_0.1_60)]">
            A Quiet Ritual
          </span>
        </span>

        <span className="font-display text-2xl leading-none text-foreground/90">Farewell</span>
        <span className="text-[12px] leading-snug text-muted-foreground">
          When you're ready to let go.
        </span>

        <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[oklch(0.48_0.16_35)] transition-colors duration-300 group-hover:text-[oklch(0.42_0.2_30)] dark:text-[oklch(0.85_0.12_55)]">
          <span aria-hidden>🔥</span>
          <span>Begin Ritual</span>
          <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
        </span>
      </span>
    </Link>
  );
}

export const FarewellEntry = memo(FarewellEntryInner);
