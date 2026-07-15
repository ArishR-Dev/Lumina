import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncAuthUserProfile } from "@/lib/lumina-auth";
import type { Session } from "@supabase/supabase-js";

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

async function resolveOAuthSession(): Promise<Session> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const errorDescription =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (errorDescription) {
    throw new Error(errorDescription);
  }

  // Supabase may already have consumed the code via detectSessionInUrl.
  const existing = await supabase.auth.getSession();
  if (existing.data.session) return existing.data.session;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) return data.session;

    // Race: client auto-detected the URL while we were exchanging.
    const retry = await supabase.auth.getSession();
    if (retry.data.session) return retry.data.session;

    throw error ?? new Error("Could not complete Google sign-in.");
  }

  // Hash/implicit return — give the client a moment to parse the URL.
  await new Promise((r) => setTimeout(r, 300));
  const late = await supabase.auth.getSession();
  if (late.data.session) return late.data.session;

  throw new Error(
    "No session after Google sign-in. In Supabase → Authentication → URL Configuration, allow https://lumina-evermore.vercel.app/** and http://localhost:3000/**.",
  );
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      try {
        const session = await resolveOAuthSession();
        try {
          await syncAuthUserProfile(session.user);
        } catch {
          // Profile sync must never block login.
        }

        window.history.replaceState({}, document.title, "/auth/callback");
        if (!cancelled) {
          // Hard navigation so the auth store reloads with a warm session.
          window.location.replace("/app/home");
        }
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        console.error("[auth/callback]", text);
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
