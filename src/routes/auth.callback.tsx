import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncAuthUserProfile } from "@/lib/lumina-auth";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing in — Lumina" },
      { name: "description", content: "Completing secure sign-in." },
    ],
  }),
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDescription =
          url.searchParams.get("error_description") ?? url.searchParams.get("error");

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (data.user) await syncAuthUserProfile(data.user);
        } else {
          // Implicit / hash return or session already restored by the client.
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (!data.session) {
            throw new Error("No authorization code or session was returned.");
          }
          await syncAuthUserProfile(data.session.user);
        }

        // Drop OAuth params from the address bar.
        window.history.replaceState({}, document.title, "/auth/callback");
        if (!cancelled) navigate({ to: "/app/home", replace: true });
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        if (!cancelled) {
          setMessage("Sign-in failed");
          toast.error(text);
          navigate({ to: "/auth", replace: true });
        }
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-4">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
