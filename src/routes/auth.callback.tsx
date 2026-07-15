import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

  // Prefer exchanging a fresh OAuth/email code over any stale session.
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) return data.session;

    const retry = await supabase.auth.getSession();
    if (retry.data.session) return retry.data.session;

    throw error ?? new Error("Could not complete sign-in.");
  }

  const existing = await supabase.auth.getSession();
  if (existing.data.session) return existing.data.session;

  await new Promise((r) => setTimeout(r, 400));
  const late = await supabase.auth.getSession();
  if (late.data.session) return late.data.session;

  throw new Error(
    "No session after sign-in. Add http://localhost:3000/** and https://lumina-evermore.vercel.app/** to Supabase → Authentication → URL Configuration → Redirect URLs.",
  );
}

function AuthCallbackPage() {
  const [message, setMessage] = useState("Finishing sign-in…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      try {
        const session = await resolveOAuthSession();
        try {
          await syncAuthUserProfile(session.user);
        } catch {
          /* profile sync must never block login */
        }

        window.history.replaceState({}, document.title, "/auth/callback");
        if (!cancelled) window.location.replace("/app/home");
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        console.error("[auth/callback]", text);
        if (!cancelled) {
          setFailed(true);
          setMessage(text);
        }
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      {!failed && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      <p className={`max-w-md text-sm ${failed ? "text-destructive" : "text-muted-foreground"}`}>
        {message}
      </p>
      {failed && (
        <Link
          to="/auth"
          className="rounded-full border border-white/60 bg-white/70 px-4 py-2 text-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
        >
          Back to sign in
        </Link>
      )}
    </div>
  );
}
