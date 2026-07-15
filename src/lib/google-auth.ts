import { supabase } from "@/integrations/supabase/client";
import { getAuthRedirectUrl } from "@/lib/lumina-auth-redirect";

/**
 * Start Google sign-in via Supabase Auth (OAuth 2.0 / PKCE).
 *
 * Google Client ID + Client Secret must be configured in the Supabase
 * Dashboard → Authentication → Providers → Google. Keep those values in
 * `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for reference —
 * never prefix the secret with `VITE_` or import it in client code.
 */
export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthRedirectUrl("/auth/callback"),
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      },
      scopes: "openid email profile",
    },
  });
}

export async function signInWithApple() {
  return supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo: getAuthRedirectUrl("/auth/callback"),
    },
  });
}
