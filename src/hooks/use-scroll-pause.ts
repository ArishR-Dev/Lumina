import { useEffect } from "react";

/**
 * Android perf: while the user is actively scrolling, pause decorative
 * animations. Ambient particles, drifting gradients, and ember effects
 * force the compositor to re-paint animated layers every frame, which
 * competes with scroll on lower-end phones and causes visible jank.
 *
 * We toggle `data-scrolling="true"` on <html> during scroll bursts,
 * clearing it after a short idle window. CSS in styles.css uses this
 * hook via `animation-play-state: paused` on ambient surfaces.
 *
 * Listener is passive and rAF-throttled — near-zero cost.
 */
export function useScrollPause() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    let ticking = false;
    let idleTimer: number | null = null;

    const clear = () => {
      root.removeAttribute("data-scrolling");
      idleTimer = null;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          if (root.getAttribute("data-scrolling") !== "true") {
            root.setAttribute("data-scrolling", "true");
          }
          ticking = false;
        });
      }
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(clear, 140);
    };

    const opts: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener("scroll", onScroll, opts);

    return () => {
      window.removeEventListener("scroll", onScroll, opts);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      root.removeAttribute("data-scrolling");
    };
  }, []);
}
