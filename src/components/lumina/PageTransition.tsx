import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Phase 3 route transition — unified motion language.
 *
 * • Duration: 220ms (matches global --lumina-dur-2)
 * • Easing:   cubic-bezier(0.22, 1, 0.36, 1)  — "ease-out-expo"-ish, calm & native
 * • No exit-y translate → prevents layout pop when the next page mounts.
 * • `mode="popLayout"` keeps the outgoing view painted until the next paints,
 *    eliminating the brief white/background flash on navigation.
 * • Respects prefers-reduced-motion.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: "transform, opacity" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
