import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { registerPwa } from "@/lib/pwa-register";
import { track } from "@/lib/analytics";

/**
 * Registers the Lumina service worker and surfaces a toast when a new
 * version is waiting. Mounts once at the app root and renders nothing.
 */
export function PwaUpdatePrompt() {
  const shownRef = useRef(false);
  const promptedAtRef = useRef<number | null>(null);
  const decidedRef = useRef(false);

  useEffect(() => {
    registerPwa(() => {
      if (shownRef.current) return;
      shownRef.current = true;
      decidedRef.current = false;
      promptedAtRef.current = Date.now();
      track("pwa_update_prompt_shown");

      const secondsSincePrompt = () =>
        promptedAtRef.current ? Math.round((Date.now() - promptedAtRef.current) / 1000) : 0;

      toast("A new version of Lumina is available.", {
        duration: Infinity,
        action: {
          label: "Update now",
          onClick: () => {
            decidedRef.current = true;
            track("pwa_update_accepted", { seconds_to_decide: secondsSincePrompt() });
            const accept = (window as unknown as { __luminaAcceptUpdate?: () => void })
              .__luminaAcceptUpdate;
            accept?.();
          },
        },
        cancel: {
          label: "Later",
          onClick: () => {
            decidedRef.current = true;
            track("pwa_update_deferred", { seconds_to_decide: secondsSincePrompt() });
            shownRef.current = false;
          },
        },
        onDismiss: () => {
          if (decidedRef.current) return;
          track("pwa_update_dismissed", { seconds_to_decide: secondsSincePrompt() });
          shownRef.current = false;
        },
        onAutoClose: () => {
          if (decidedRef.current) return;
          track("pwa_update_auto_closed", { seconds_to_decide: secondsSincePrompt() });
          shownRef.current = false;
        },
      });
    });
  }, []);

  return null;
}
