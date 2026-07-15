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
 * Official Google Identity Services button (must receive a real user click).
 * Completes login via supabase.auth.signInWithIdToken — no server code exchange.
 */
export function GoogleSignInButton({ disabled, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mounting, setMounting] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || disabled) return;

    let cancelled = false;

    const paint = () => {
      if (cancelled || !hostRef.current) return;
      void mountGoogleButton(
        hostRef.current,
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
          if (!cancelled) setMounting(false);
        })
        .catch((err) => {
          if (!cancelled) {
            setMounting(false);
            toast.error(err instanceof Error ? err.message : String(err));
          }
        });
    };

    const raf = window.requestAnimationFrame(paint);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [disabled]);

  return (
    <div
      className={cn(
        "relative flex min-h-[44px] w-full items-center justify-center overflow-hidden rounded-2xl",
        (disabled || busy) && "pointer-events-none opacity-50",
        className,
      )}
    >
      {mounting && (
        <div className="absolute inset-0 z-0 flex items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/70 text-sm font-medium dark:border-white/10 dark:bg-white/5">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          Google
        </div>
      )}
      <div
        ref={hostRef}
        className="relative z-10 flex w-full items-center justify-center [&_>div]:!mx-auto"
        aria-label="Continue with Google"
      />
    </div>
  );
}
