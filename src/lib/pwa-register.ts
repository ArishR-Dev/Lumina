// PWA registration intentionally disabled while /sw.js is not shipped by
// the Nitro/Vercel build. We only unregister stale workers so consoles stay clean.

type UpdateCallback = () => void;

async function unregisterAppSW() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* noop */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* noop */
  }
}

export function registerPwa(_onUpdateAvailable: UpdateCallback): void {
  if (typeof window === "undefined") return;
  void unregisterAppSW();
}
