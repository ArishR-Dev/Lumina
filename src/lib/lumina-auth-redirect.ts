/**
 * Returns the origin used for all Lumina auth redirects (OAuth, email confirm,
 * password reset). Defaults to `window.location.origin` so preview, dev, and
 * every custom domain keep working automatically. To pin production redirects
 * to a specific origin (recommended once a custom domain is live), set the
 * build-time env var `VITE_LUMINA_AUTH_REDIRECT_URL` (e.g. `https://app.lumina.example`).
 *
 * Notes:
 * - Must be a full same-origin public URL — never a protected route.
 * - The value must also be present in Supabase Auth → URL Configuration →
 *   Redirect URLs, otherwise Supabase will silently drop the redirect.
 */
export function getAuthRedirectBase(): string {
  const configured = import.meta.env.VITE_LUMINA_AUTH_REDIRECT_URL as string | undefined;
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function getAuthRedirectUrl(path = "/"): string {
  const base = getAuthRedirectBase();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix === "/" ? "" : suffix}`;
}
