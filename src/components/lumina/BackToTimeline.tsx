import { useEffect, useState } from "react";
import { useLocation, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/**
 * Floating "Back to Timeline" affordance. Appears on any page when the
 * user opened it from the Timeline (we saved a scroll marker there).
 * Clicking navigates back to /app/timeline; the Timeline page reads the
 * marker on mount and restores scroll + focus.
 */
export function BackToTimeline() {
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const routerState = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onTimeline = location.pathname.startsWith("/app/timeline");
    const marker = sessionStorage.getItem("lumina:timeline:scroll");
    setVisible(!!marker && !onTimeline);
  }, [location.pathname, routerState]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/app/timeline" })}
      aria-label="Back to timeline"
      className="fixed left-4 top-4 z-40 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3.5 py-2 text-xs font-medium uppercase tracking-widest text-foreground shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/10 dark:bg-black/60 dark:text-white sm:left-6 sm:top-6"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to timeline
    </button>
  );
}
