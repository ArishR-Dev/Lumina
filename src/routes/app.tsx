import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { PageTransition } from "@/components/lumina/PageTransition";
import { AnimatePresence, motion } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/lumina/Sidebar";
import { MobileNav } from "@/components/lumina/MobileNav";
import { Petals } from "@/components/lumina/Petals";
import { CommandPalette } from "@/components/lumina/CommandPalette";
import { ThemeApplier } from "@/components/lumina/ThemeApplier";
import { SeasonalDecor } from "@/components/lumina/SeasonalDecor";
import { Celebration } from "@/components/lumina/Celebration";
import { useIsMobile } from "@/hooks/use-mobile";
import { useScrollPause } from "@/hooks/use-scroll-pause";


import { Toaster } from "@/components/ui/sonner";
import { Flower2 } from "lucide-react";
import { useAuth, bindAuthListener } from "@/lib/lumina-auth";
import { useLuminaSync } from "@/lib/lumina-sync";
import { luminaDialog } from "@/lib/lumina-dialog";
import { useUnlockCinematicPlaying } from "@/lib/private-album/session";

export const Route = createFileRoute("/app")({
  component: AppLayout,
  ssr: false, // session lives in localStorage; keep this subtree client-only
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
});


function AppLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  const isMobile = useIsMobile();
  // Same ambience on phone and desktop — UI/UX parity.
  const petalCount = 10;

  // Farewell renders as a full-viewport immersive sanctuary — no sidebar,
  // no mobile nav, no search, no seasonal decor. See FarewellShell below.
  const isFarewell = path.startsWith("/app/farewell");
  // Notes writing routes (opening a specific note, or composing a new one)
  // are also immersive — the Living Paper occupies the entire viewport,
  // matching the Farewell ritual's "step into another world" feel.
  const isNoteWriting =
    path === "/app/notes/new" ||
    (path.startsWith("/app/notes/") && path !== "/app/notes" && path !== "/app/notes/");
  const immersive = isFarewell || isNoteWriting;
  // Private album hides the sidebar for a focused, vault-like experience.
  const isPrivate = path.startsWith("/app/private");
  // While the fullscreen unlock cinematic plays on Home, hide the shell
  // (sidebar + mobile nav) so nothing pokes through the ritual.
  const cinematicPlaying = useUnlockCinematicPlaying();
  const hideShell = isPrivate || cinematicPlaying;


  // Preserve the app-shell scroll position across immersive Farewell visits
  // so returning from the ritual lands the user exactly where they left off.
  const savedScrollRef = useRef<number>(0);
  const wasImmersiveRef = useRef<boolean>(false);

  useEffect(() => {
    bindAuthListener();
  }, []);


  useEffect(() => {
    const el = document.getElementById("main-content");
    const leavingImmersive = wasImmersiveRef.current && !immersive;

    if (immersive && !wasImmersiveRef.current) {
      // Entering Farewell — remember where the app shell was scrolled to.
      savedScrollRef.current = el?.scrollTop ?? 0;
    }

    if (!immersive) {
      if (leavingImmersive && el) {
        // Restore prior scroll position when returning to normal Lumina.
        el.scrollTo({ top: savedScrollRef.current, left: 0, behavior: "auto" });
      } else if (el) {
        el.scrollTo({ top: 0, left: 0, behavior: "auto" });
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    }

    wasImmersiveRef.current = immersive;
  }, [path, immersive]);


  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  // Mount the sync engine at layout level so it runs for every /app page.
  useLuminaSync();

  // Android perf: pause ambient animations during active scrolling.
  useScrollPause();


  if (loading || !user) {
    return (
      <div className="relative flex min-h-[100dvh] items-center justify-center">
        <Petals count={petalCount} />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass flex flex-col items-center gap-3 rounded-3xl px-8 py-6"
        >
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[oklch(0.86_0.12_340)] to-[oklch(0.82_0.1_290)] text-white shadow-md">
            <Flower2 className="h-6 w-6 animate-pulse" />
          </div>
          <div className="font-hand text-lg text-muted-foreground">preparing your sanctuary…</div>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <ThemeApplier />
      <Toaster
        position="bottom-center"
        closeButton
        offset="24px"
        mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}
      />
      <Celebration />

      <AnimatePresence initial={false}>
        {immersive ? (
          isFarewell ? <FarewellShell key="immersive-farewell" /> : <WritingShell key="immersive-notes" />
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex h-[100dvh] flex-col [overflow-x:clip] md:flex-row"
          >
            <Petals count={petalCount} />
            <SeasonalDecor />

            {/* Sidebar: fixed-height column, does NOT scroll with the page */}
            {!hideShell && (
              <div
                className="relative z-20 hidden shrink-0 md:block"
                style={{
                  paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
                  paddingLeft: "max(env(safe-area-inset-left, 0px), 12px)",
                  paddingBottom: 12,
                }}
              >
                <Sidebar onOpenSearch={() => setSearchOpen(true)} />
              </div>
            )}


            {/* Main scroll container — the ONLY vertical scrollbar */}
            <main
              id="main-content"
              tabIndex={-1}
              className="relative z-10 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain focus:outline-none"
              style={{
                paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
                paddingRight: "env(safe-area-inset-right, 0px)",
                paddingLeft: "env(safe-area-inset-left, 0px)",
              }}
            >
              <div className="mx-auto max-w-[1260px] px-6 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+140px)] md:px-4 md:pb-16">
                <PageTransition><Outlet /></PageTransition>
              </div>
            </main>

            {!hideShell && <MobileNav onOpenSearch={() => setSearchOpen(true)} />}
            <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
}

/* ------------------------------------------------------------------ *
 *  Farewell immersive shell
 *
 *  Full-viewport sanctuary. NO shared sidebar, mobile nav, search,
 *  seasonal decor, or dashboard chrome — rendering the ritual outside
 *  the standard app layout is the whole point.
 *
 *  - Soft animated gradient + vignette + very slow drifting embers
 *  - Cinematic enter (fade + subtle zoom-in) / reverse on exit
 *  - ESC prompts "Leave this ritual?" and returns to /app/home
 *  - No max-width dashboard container; content is centered up to 900px
 *    by each farewell route itself
 * ------------------------------------------------------------------ */
function FarewellShell() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // ESC: ask before leaving the ritual entirely. We only intercept when the
  // user is at the farewell hub (`/app/farewell`) — deeper routes have their
  // own Back affordances and the scene's own escape handling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Never swallow ESC while a dialog / input has focus.
      const t = e.target as HTMLElement | null;
      const inField =
        t?.tagName === "INPUT" ||
        t?.tagName === "TEXTAREA" ||
        t?.isContentEditable;
      if (inField) return;
      e.preventDefault();
      void luminaDialog.warning({
        title: "Leave this ritual?",
        description: "You can return to the farewell space anytime.",
        confirmLabel: "Leave",
        cancelLabel: "Stay",
      }).then((leave) => {
        if (leave) navigate({ to: "/app/home" });
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, path]);

  return (
    <motion.div
      key="farewell-shell"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: "oklch(0.14 0.03 30)" }}
      role="region"
      aria-label="Farewell ritual"
    >
      {/* Animated soft gradient — very slow, warm ambient light */}
      <div
        aria-hidden
        data-scroll-pause
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 22% 88%, oklch(0.55 0.22 35 / .45), transparent 65%)," +
            "radial-gradient(55% 60% at 82% 10%, oklch(0.42 0.2 320 / .38), transparent 65%)," +
            "radial-gradient(80% 70% at 50% 50%, oklch(0.28 0.08 30 / .55), transparent 75%)," +
            "linear-gradient(180deg, oklch(0.13 0.03 30) 0%, oklch(0.11 0.03 25) 100%)",
          animation: "farewell-bg-drift 24s ease-in-out infinite alternate",
        }}
      />

      {/* Vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, oklch(0 0 0 / .55) 100%)",
        }}
      />

      {/* Slow drifting embers */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {EMBERS.map((e, i) => (
          <span
            key={i}
            data-scroll-pause
            className="absolute block rounded-full"
            style={{
              left: `${e.left}%`,
              bottom: "-4%",
              width: e.size,
              height: e.size,
              background:
                "radial-gradient(circle, oklch(0.9 0.14 60 / .8) 0%, oklch(0.7 0.2 40 / .4) 45%, transparent 70%)",
              filter: "blur(0.5px)",
              animation: `farewell-ember-rise ${e.duration}s linear ${e.delay}s infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>


      {/* Local keyframes — scoped by unique names so they don't collide */}
      <style>{`
        @keyframes farewell-bg-drift {
          0%   { transform: scale(1) translate3d(0,0,0); filter: hue-rotate(0deg); }
          100% { transform: scale(1.04) translate3d(-1%, -1%, 0); filter: hue-rotate(-6deg); }
        }
        @keyframes farewell-ember-rise {
          0%   { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0; }
          10%  { opacity: .9; }
          80%  { opacity: .5; }
          100% { transform: translate3d(var(--dx, 12px), -110vh, 0) scale(1.1); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-farewell-shell] * { animation: none !important; }
        }
      `}</style>

      {/* Content viewport — the routes' own headers/back links act as controls */}
      <div
        data-farewell-shell
        className="relative z-10 flex h-full w-full items-start justify-center overflow-y-auto"
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 32px)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 32px)",
          paddingLeft: "max(env(safe-area-inset-left, 0px), 20px)",
          paddingRight: "max(env(safe-area-inset-right, 0px), 20px)",
        }}
      >
        <div className="w-full max-w-[900px] py-10 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 *  Writing immersive shell (Notes)
 *
 *  Same intent as FarewellShell: strip all dashboard chrome — sidebar,
 *  mobile nav, search, seasonal decor — so opening a note feels like
 *  stepping into a private writing sanctuary. The route itself paints
 *  its own ambient wash + Living Paper.
 * ------------------------------------------------------------------ */
function WritingShell() {
  return (
    <motion.div
      key="writing-shell"
      initial={{ opacity: 0, scale: 1.01 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 overflow-y-auto bg-background"
      role="region"
      aria-label="Writing sanctuary"
    >
      <Outlet />
    </motion.div>
  );
}

const EMBERS = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 83) % 100,
  size: 3 + ((i * 7) % 5),
  duration: 22 + ((i * 5) % 18),
  delay: (i * 1.7) % 12,
}));
