import { useEffect } from "react";

/**
 * While the user scrolls, pause decorative animations so the compositor
 * can keep up — especially on phones. Does not remove any UI, only
 * temporarily freezes ambient CSS animations.
 */
export function useScrollPause(enabled = true) {
  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;
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
      idleTimer = window.setTimeout(clear, 160);
    };

    const opts: AddEventListenerOptions = { passive: true, capture: true };
    const targets: Array<Window | HTMLElement> = [window];
    const main = document.getElementById("main-content");
    if (main) targets.push(main);

    for (const t of targets) t.addEventListener("scroll", onScroll, opts);

    return () => {
      for (const t of targets) t.removeEventListener("scroll", onScroll, opts);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      root.removeAttribute("data-scrolling");
    };
  }, [enabled]);
}
