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

/**
 * Official Google Identity Services button (must be visible & fully opaque
 * to receive taps — near-invisible overlays break on mobile browsers).
 */
export function GoogleSignInButton({ disabled, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || disabled) return;

    let cancelled = false;

    void mountGoogleButton(
      host,
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
        if (!cancelled) {
          setReady(true);
          setFailed(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setReady(false);
          setFailed(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [disabled]);

  return (
    <div
      className={cn(
        "w-full",
        (disabled || busy) && "pointer-events-none opacity-60",
        className,
      )}
    >
      {!ready && !failed && (
        <div className="mb-2 flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/70 text-sm font-medium dark:border-white/10 dark:bg-white/5">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          Loading Google…
        </div>
      )}

      {failed && (
        <p className="mb-2 text-center text-xs text-destructive">{failed}</p>
      )}

      {/* Visible GIS control — this is what the user must tap */}
      <div
        ref={hostRef}
        className={cn(
          "flex w-full justify-center [&_>div]:!mx-auto [&_>div]:!w-full",
          !ready && "min-h-0 overflow-hidden opacity-0",
          ready && "min-h-11",
        )}
        aria-label="Continue with Google"
      />

      {busy && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Signing you in…
        </div>
      )}
    </div>
  );
}
