import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Premium branded splash screen shown once per browser session.
 * Deep midnight gradient background, centered app icon, "LUMINA" wordmark.
 * No spinner, no tagline. Fades in then out.
 */
export function SplashScreen() {
  // Render nothing during SSR and the very first client paint. The splash is
  // a framer-motion animated tree; if we emit any of it on the server, its
  // client-side style output diverges from the server-rendered attributes and
  // React logs a hydration-mismatch warning for every route load. We defer
  // the entire component until after mount, which also lets us read
  // sessionStorage safely.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem("lumina:splash-seen") === "1";
    } catch {
      /* ignore */
    }
    if (alreadySeen) return;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      try {
        sessionStorage.setItem("lumina:splash-seen", "1");
      } catch {
        /* ignore */
      }
    }, 1400);
    return () => clearTimeout(t);
  }, []);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="lumina-splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 40%, #3d1e4a 0%, #1a1033 55%, #0b0619 100%)",
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            paddingLeft: "env(safe-area-inset-left, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="relative">
              <div
                aria-hidden
                className="absolute inset-0 -z-10 rounded-[36%] blur-3xl"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(255,200,220,0.55), rgba(196,138,158,0.25) 55%, transparent 75%)",
                  transform: "scale(1.6)",
                }}
              />
              <img
                src="/lumina-mark-512.png?v=evermore1"
                alt=""
                width={128}
                height={128}
                className="h-32 w-32 rounded-[28%] shadow-[0_30px_80px_-20px_rgba(196,138,158,0.6)]"
                draggable={false}
              />
            </div>
            <motion.div
              initial={{ opacity: 0, letterSpacing: "0.5em" }}
              animate={{ opacity: 1, letterSpacing: "0.28em" }}
              transition={{ duration: 1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-xl uppercase text-white/95 sm:text-2xl"
              style={{ textShadow: "0 0 40px rgba(255,220,235,0.35)" }}
            >
              Lumina Evermore
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
