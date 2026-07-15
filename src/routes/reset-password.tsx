import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Flower2, Lock, Loader2, ArrowLeft } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Petals } from "@/components/lumina/Petals";
import { luminaDialog } from "@/lib/lumina-dialog";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  ssr: false,
  head: () => ({ meta: [{ title: "Reset password — Lumina" }] }),
});

const pwSchema = z.string().min(8, "At least 8 characters").max(128);

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        if (!cancelled) setReady(true);
      }
    });

    void (async () => {
      try {
        const url = new URL(window.location.href);
        const oauthError =
          url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (oauthError) {
          if (!cancelled) setLinkError(oauthError);
          return;
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          window.history.replaceState({}, document.title, "/reset-password");
          if (!cancelled && data.session) setReady(true);
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (!cancelled && data.session) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setLinkError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pw = pwSchema.safeParse(password);
    if (!pw.success) return toast.error(pw.error.issues[0].message);
    if (password !== confirm) return toast.error("Passwords don't match");
    setBusy(true);
    const loading = luminaDialog.showLoading({
      title: "Updating your password…",
      description: "Almost there.",
    });
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. Welcome back.");
      navigate({ to: "/app/home", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      loading.close();
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-12">
      <Petals count={12} />
      <Link
        to="/auth"
        className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Sign in
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass w-full max-w-md rounded-3xl p-8 sm:p-10"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-[oklch(0.86_0.12_340)] to-[oklch(0.82_0.1_290)] text-white shadow-lg">
            <Flower2 className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-3xl">Set a new password</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {linkError
              ? "This reset link is invalid or expired."
              : ready
                ? "Choose a soft phrase you'll remember."
                : "Confirming your reset link…"}
          </p>
          {linkError && <p className="mt-2 text-xs text-destructive">{linkError}</p>}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">New password</label>
            <div className="mt-1 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2.5 focus-within:border-primary/50">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                disabled={!ready}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                placeholder="at least 8 characters"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Confirm</label>
            <div className="mt-1 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2.5 focus-within:border-primary/50">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
                disabled={!ready}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                placeholder="type it once more"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={busy || !ready}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] py-3 text-sm font-medium text-white shadow-lg transition hover:brightness-105 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button>
        </form>
      </motion.div>
    </div>
  );
}
