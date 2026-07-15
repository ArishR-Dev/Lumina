// Guarded Service Worker registration for Lumina.
// Never register in dev / preview / iframe, leave a `?sw=off` kill switch,
// and only register when /sw.js is actually deployable (avoids console 404 noise).

const SW_URL = "/sw.js";

type UpdateCallback = () => void;

function inLovablePreview(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  return false;
}

function inIframe(): boolean {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    return true;
  }
}

async function unregisterAppSW() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.endsWith("/sw.js") || url.endsWith("/service-worker.js");
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* noop */
  }
}

async function swIsAvailable(): Promise<boolean> {
  try {
    const res = await fetch(SW_URL, { method: "HEAD", cache: "no-store" });
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    // SPA fallbacks sometimes return HTML for missing files — treat that as absent.
    if (type.includes("text/html")) return false;
    return true;
  } catch {
    return false;
  }
}

export function registerPwa(onUpdateAvailable: UpdateCallback): void {
  if (typeof window === "undefined") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const isProd = import.meta.env.PROD;
  const isKillSwitch =
    new URLSearchParams(window.location.search).has("sw") &&
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (!isProd || inIframe() || inLovablePreview() || isKillSwitch) {
    void unregisterAppSW();
    return;
  }

  void (async () => {
    if (!(await swIsAvailable())) {
      void unregisterAppSW();
      return;
    }

    try {
      const { Workbox } = await import("workbox-window");
      const wb = new Workbox(SW_URL, { scope: "/" });

      wb.addEventListener("waiting", () => {
        onUpdateAvailable();
      });

      wb.addEventListener("controlling", () => {
        window.location.reload();
      });

      (window as unknown as { __luminaAcceptUpdate?: () => void }).__luminaAcceptUpdate = () => {
        wb.messageSkipWaiting();
      };

      await wb.register();
    } catch {
      /* missing or invalid SW — stay silent */
      void unregisterAppSW();
    }
  })();
}
