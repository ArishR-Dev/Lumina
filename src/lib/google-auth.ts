import { supabase } from "@/integrations/supabase/client";
import { syncAuthUserProfile } from "@/lib/lumina-auth";

export type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: "signin" | "signup" | "use";
    ux_mode?: "popup" | "redirect";
    use_fedcm_for_prompt?: boolean;
    itp_support?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: Record<string, string | number | boolean>,
  ) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

export function getGoogleClientId(): string {
  const id = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
  if (!id) {
    throw new Error(
      "Missing VITE_GOOGLE_CLIENT_ID. Add it in .env and Vercel environment variables, then redeploy.",
    );
  }
  return id;
}

let gsiLoading: Promise<void> | null = null;

export function loadGsi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiLoading) return gsiLoading;

  gsiLoading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Sign-In")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(script);
  }).finally(() => {
    gsiLoading = null;
  });

  return gsiLoading;
}

/** Complete login after Google returns an ID token (JWT). */
export async function completeGoogleIdTokenSignIn(credential: string) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
  });
  if (error) throw error;
  if (data.user) {
    try {
      await syncAuthUserProfile(data.user);
    } catch {
      /* never block login */
    }
  }
  return data;
}

/**
 * Mount a real Google Identity Services button into `parent`.
 * The user must click this control themselves (programmatic .click() is blocked).
 */
export async function mountGoogleButton(
  parent: HTMLElement,
  onCredential: (credential: string) => void | Promise<void>,
  onError: (message: string) => void,
) {
  await loadGsi();
  const id = window.google?.accounts?.id;
  if (!id) throw new Error("Google Sign-In failed to initialize");

  const clientId = getGoogleClientId();

  try {
    id.cancel();
  } catch {
    /* noop */
  }
  parent.innerHTML = "";

  id.initialize({
    client_id: clientId,
    callback: (response) => {
      if (!response.credential) {
        onError("Google did not return a credential.");
        return;
      }
      void Promise.resolve(onCredential(response.credential)).catch((err) => {
        onError(err instanceof Error ? err.message : String(err));
      });
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    context: "signin",
    ux_mode: "popup",
    itp_support: true,
  });

  const width = Math.max(280, Math.floor(parent.getBoundingClientRect().width) || 320);
  id.renderButton(parent, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "pill",
    width,
    logo_alignment: "left",
  });
}
