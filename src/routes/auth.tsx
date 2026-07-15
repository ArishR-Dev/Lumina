import { createFileRoute, useNavigate, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Flower2, Mail, Lock, Loader2, ArrowLeft } from "lucide-react";
import { Petals } from "@/components/lumina/Petals";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/lumina-auth";
import { getAuthRedirectUrl } from "@/lib/lumina-auth-redirect";
import { signInWithApple, signInWithGoogle } from "@/lib/google-auth";
import { luminaDialog } from "@/lib/lumina-dialog";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Lumina" },
      { name: "description", content: "Sign in to your Lumina sanctuary." },
    ],
  }),
});

type Mode = "sign-in" | "sign-up" | "forgot";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(8, "At least 8 characters").max(128);

function AuthPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // `/auth/callback` is a child route — must render Outlet or the callback never mounts.
  if (pathname === "/auth/callback" || pathname.startsWith("/auth/callback/")) {
    return <Outlet />;
  }
  return <AuthForm />;
}

function AuthForm() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app/home", replace: true });
  }, [user, loading, navigate]);

  // Fallback when Supabase returns to /auth?code=... instead of /auth/callback.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname !== "/auth") return;

    const code = url.searchParams.get("code");
    const oauthError =
      url.searchParams.get("error_description") ?? url.searchParams.get("error");

    if (oauthError) {
      toast.error(oauthError);
      window.history.replaceState({}, document.title, "/auth");
      return;
    }

    if (!code) return;

    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          const { data } = await supabase.auth.getSession();
          if (!data.session) throw error;
        }
        window.history.replaceState({}, document.title, "/auth");
        if (!cancelled) window.location.replace("/app/home");
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : String(err));
          window.history.replaceState({}, document.title, "/auth");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const onSocial = async (provider: "google" | "apple") => {
    setBusy(true);
    const loading = luminaDialog.showLoading({
      title: `Connecting with ${provider === "google" ? "Google" : "Apple"}…`,
      description:
        provider === "google"
          ? "Choose your Google account."
          : "Opening a secure sign-in window.",
    });
    try {
      if (provider === "google") {
        const { error } = await signInWithGoogle();
        if (error) {
          toast.error(error.message || "Could not sign in with Google");
          return;
        }
        window.location.replace("/app/home");
        return;
      }

      const { data, error } = await signInWithApple();
      if (error) {
        toast.error(error.message || "Could not sign in with Apple");
        return;
      }
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      navigate({ to: "/app/home", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      loading.close();
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "forgot") {
      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) return toast.error(parsed.error.issues[0].message);
      setBusy(true);
      const loading = luminaDialog.showLoading({
        title: "Sending reset link…",
        description: parsed.data,
      });
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
          redirectTo: getAuthRedirectUrl("/reset-password"),
        });
        if (error) throw error;
        toast.success("Check your inbox for a reset link.");
        setMode("sign-in");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        loading.close();
        setBusy(false);
      }
      return;
    }

    const em = emailSchema.safeParse(email);
    if (!em.success) return toast.error(em.error.issues[0].message);
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return toast.error(pw.error.issues[0].message);

    setBusy(true);
    const loading = luminaDialog.showLoading({
      title: mode === "sign-up" ? "Creating your Lumina…" : "Signing you in…",
      description: em.data,
    });
    try {
      if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({
          email: em.data,
          password: pw.data,
          options: {
            emailRedirectTo: getAuthRedirectUrl("/auth/callback"),
            data: { display_name: name.trim() || em.data.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Welcome. Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: em.data,
          password: pw.data,
        });
        if (error) throw error;
        navigate({ to: "/app/home", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      loading.close();
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-12">
      <Petals count={14} />
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-20 h-[480px] w-[480px] rounded-full bg-[oklch(0.9_0.12_340)] opacity-50 blur-3xl" />
        <div className="absolute -right-40 top-40 h-[560px] w-[560px] rounded-full bg-[oklch(0.9_0.1_300)] opacity-40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[720px] rounded-full bg-[oklch(0.97_0.06_60)] opacity-70 blur-3xl" />
      </div>

      <Link
        to="/"
        className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition hover:text-foreground dark:border-white/10 dark:bg-white/5"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="glass relative w-full max-w-md rounded-3xl p-8 sm:p-10"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-[oklch(0.86_0.12_340)] to-[oklch(0.82_0.1_290)] text-white shadow-lg">
            <Flower2 className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-3xl leading-tight">
            {mode === "sign-up" ? "Begin your Lumina" : mode === "forgot" ? "Reset your password" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "sign-up"
              ? "Your sanctuary awaits. It only takes a moment."
              : mode === "forgot"
                ? "We'll send you a soft little link."
                : "Sign in to your cozy corner."}
          </p>
        </div>

        {mode !== "forgot" && (
          <div className="mb-5 grid grid-cols-2 gap-2">
            <button
              onClick={() => onSocial("google")}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm font-medium transition hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <GoogleIcon /> Google
            </button>
            <button
              onClick={() => onSocial("apple")}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm font-medium transition hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <AppleIcon /> Apple
            </button>
          </div>
        )}

        {mode !== "forgot" && (
          <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            <div className="h-px flex-1 bg-white/60 dark:bg-white/10" />
            or with email
            <div className="h-px flex-1 bg-white/60 dark:bg-white/10" />
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <AnimatePresence mode="wait">
            {mode === "sign-up" && (
              <motion.div
                key="name"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="what should we call you?"
                  className="mt-1 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 dark:border-white/10 dark:bg-white/5"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Email</label>
            <div className="mt-1 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2.5 focus-within:border-primary/50 dark:border-white/10 dark:bg-white/5">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="you@example.com"
              />
            </div>
          </div>

          {mode !== "forgot" && (
            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Password</label>
              <div className="mt-1 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2.5 focus-within:border-primary/50 dark:border-white/10 dark:bg-white/5">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder={mode === "sign-up" ? "at least 8 characters" : "your password"}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] py-3 text-sm font-medium text-white shadow-lg transition hover:brightness-105 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "sign-up" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "sign-in" && (
            <>
              <button type="button" onClick={() => setMode("forgot")} className="story-link">
                Forgot password?
              </button>
              <div className="mt-2">
                New here?{" "}
                <button type="button" onClick={() => setMode("sign-up")} className="font-medium text-foreground story-link">
                  Create an account
                </button>
              </div>
            </>
          )}
          {mode === "sign-up" && (
            <>
              Already have one?{" "}
              <button type="button" onClick={() => setMode("sign-in")} className="font-medium text-foreground story-link">
                Sign in
              </button>
            </>
          )}
          {mode === "forgot" && (
            <button type="button" onClick={() => setMode("sign-in")} className="story-link">
              Back to sign in
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.75-6-6.15S8.7 5.9 12 5.9c1.9 0 3.15.8 3.87 1.5l2.65-2.55C16.86 3.3 14.63 2.3 12 2.3 6.86 2.3 2.7 6.46 2.7 11.6S6.86 20.9 12 20.9c6.9 0 9.16-4.85 9.16-7.35 0-.5-.05-.88-.11-1.35H12z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M16.365 12.36c-.03-2.7 2.2-3.99 2.3-4.05-1.25-1.83-3.19-2.08-3.88-2.11-1.65-.17-3.22.97-4.06.97-.84 0-2.13-.95-3.51-.92-1.8.03-3.47 1.05-4.4 2.66-1.88 3.26-.48 8.07 1.35 10.72.9 1.29 1.96 2.74 3.35 2.69 1.35-.05 1.86-.87 3.49-.87 1.63 0 2.09.87 3.52.85 1.45-.03 2.37-1.31 3.26-2.61 1.03-1.5 1.45-2.96 1.47-3.03-.03-.01-2.83-1.09-2.89-4.3zM13.68 4.4c.74-.9 1.24-2.14 1.1-3.4-1.06.05-2.36.71-3.13 1.6-.69.79-1.29 2.06-1.13 3.28 1.18.09 2.4-.6 3.16-1.48z" />
    </svg>
  );
}
