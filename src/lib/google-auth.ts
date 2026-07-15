import { supabase } from "@/integrations/supabase/client";
import { getAuthRedirectUrl } from "@/lib/lumina-auth-redirect";

type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: "signin" | "signup" | "use";
    ux_mode?: "popup" | "redirect";
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: (momentListener?: (notification: {
    isNotDisplayed: () => boolean;
    isSkippedMoment: () => boolean;
    isDismissedMoment: () => boolean;
  }) => void) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: string;
      theme?: string;
      size?: string;
      text?: string;
      shape?: string;
      width?: number;
    },
  ) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function getGoogleClientId(): string {
  const id = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
  if (!id) {
    throw new Error(
      "Missing VITE_GOOGLE_CLIENT_ID. Add your Google OAuth Web Client ID to .env (and Vercel).",
    );
  }
  return id;
}

let gsiLoading: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiLoading) return gsiLoading;

  gsiLoading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Sign-In")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(script);
  }).finally(() => {
    gsiLoading = null;
  });

  return gsiLoading;
}

/**
 * Obtain a Google ID token via Google Identity Services (no client secret),
 * then create a Supabase session with signInWithIdToken.
 *
 * This avoids Supabase's server-side Google code exchange, which was failing
 * with "Unable to exchange external code".
 */
export async function signInWithGoogle() {
  await loadGsi();
  const clientId = getGoogleClientId();
  const id = window.google?.accounts?.id;
  if (!id) throw new Error("Google Sign-In failed to initialize");

  const credential = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:-9999px;top:0;width:240px;height:44px;overflow:hidden;opacity:0;pointer-events:auto;";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);

    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error("Google sign-in timed out. Please try again.")));
    }, 120_000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      try {
        id.cancel();
      } catch {
        /* noop */
      }
      host.remove();
    };

    id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          finish(() => resolve(response.credential!));
        } else {
          finish(() => reject(new Error("Google did not return a credential.")));
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      context: "signin",
      ux_mode: "popup",
      use_fedcm_for_prompt: true,
    });

    id.renderButton(host, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      width: 240,
    });

    // Prefer clicking the official GIS control (reliable for custom buttons).
    window.setTimeout(() => {
      const clickable =
        host.querySelector<HTMLElement>('div[role="button"]') ||
        host.querySelector<HTMLElement>("div") ||
        (host.firstElementChild as HTMLElement | null);

      if (clickable) {
        clickable.click();
        return;
      }

      // Fallback: One Tap / FedCM prompt
      id.prompt((notification) => {
        if (
          notification.isNotDisplayed() ||
          notification.isSkippedMoment() ||
          notification.isDismissedMoment()
        ) {
          finish(() =>
            reject(
              new Error(
                "Google sign-in was blocked or dismissed. Allow popups for this site and try again.",
              ),
            ),
          );
        }
      });
    }, 50);
  });

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
  });

  return { data, error, redirected: false as const };
}

export async function signInWithApple() {
  return supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo: getAuthRedirectUrl("/auth/callback"),
    },
  });
}
