import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  completeGoogleIdTokenSignIn,
  mountGoogleButton,
} from "@/lib/google-auth";
import { luminaDialog } from "@/lib/lumina-dialog";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  className?: string;
};

const WIDTH_REMOUNT_DELTA = 16;

/**
 * Custom-looking Google button with always-visible G mark.
 * A real GIS control is layered on top so taps work on mobile.
 */
export function GoogleSignInButton({ disabled, className }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const gisRef = useRef<HTMLDivElement>(null);
  const lastWidthRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const shell = shellRef.current;
    const gis = gisRef.current;
    if (!shell || !gis || disabled) return;

    let cancelled = false;
    let debounceTimer: number | undefined;

    const paint = (force = false) => {
      if (cancelled || !gisRef.current || !shellRef.current) return;
      const width = Math.max(240, Math.floor(shellRef.current.clientWidth));
      if (!force && Math.abs(width - lastWidthRef.current) < WIDTH_REMOUNT_DELTA) return;
      lastWidthRef.current = width;
      gisRef.current.style.width = `${width}px`;

      void mountGoogleButton(
        gisRef.current,
        async (credential) => {
          setBusy(true);
          const loading = luminaDialog.showLoading({
            title: "Connecting with Google…",
            description: "Finishing secure sign-in.",
          });
          try {
            await completeGoogleIdTokenSignIn(credential);
            window.location.replace("/app/home");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err));
          } finally {
            loading.close();
            setBusy(false);
          }
        },
        (message) => toast.error(message),
      )
        .then(() => {
          if (!cancelled) setReady(true);
        })
        .catch((err) => {
          if (!cancelled) {
            setReady(false);
            toast.error(err instanceof Error ? err.message : String(err));
          }
        });
    };

    const schedulePaint = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => paint(false), 120);
    };

    const raf = window.requestAnimationFrame(() => paint(true));
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedulePaint) : null;
    ro?.observe(shell);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(debounceTimer);
      ro?.disconnect();
    };
  }, [disabled]);

  return (
    <div
      ref={shellRef}
      className={cn(
        "relative h-11 w-full touch-manipulation overflow-hidden rounded-2xl border border-white/60 bg-white/70 dark:border-white/10 dark:bg-white/5",
        (disabled || busy) && "pointer-events-none opacity-50",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center gap-2.5 px-3 text-sm font-medium text-foreground">
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <GoogleGlyph />
        )}
        <span>Continue with Google</span>
      </div>

      <div
        ref={gisRef}
        className="absolute inset-0 z-10 flex items-center justify-center opacity-[0.02] [&_iframe]:!h-full [&_div]:!max-h-none"
        aria-label="Continue with Google"
      />

      {!ready && !busy && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/40 dark:bg-black/20">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.71z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
