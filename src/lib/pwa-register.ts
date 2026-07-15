// Guarded Service Worker registration for Lumina.
// Follows the Lovable PWA skill: never register in dev / preview / iframe,
// always leaves a `?sw=off` kill switch, and only registers /sw.js.

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

export function registerPwa(onUpdateAvailable: UpdateCallback): void {
  if (typeof window === "undefined") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const isProd = import.meta.env.PROD;
  const isKillSwitch = new URLSearchParams(window.location.search).has("sw") &&
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (!isProd || inIframe() || inLovablePreview() || isKillSwitch) {
    void unregisterAppSW();
    return;
  }

  // Lazy import so workbox-window never ships in dev.
  void import("workbox-window").then(({ Workbox }) => {
    const wb = new Workbox(SW_URL, { scope: "/" });

    wb.addEventListener("waiting", () => {
      onUpdateAvailable();
    });

    wb.addEventListener("controlling", () => {
      // Reload only after the user accepts the update.
      window.location.reload();
    });

    // Expose an accept hook for the update-prompt UI.
    (window as unknown as { __luminaAcceptUpdate?: () => void }).__luminaAcceptUpdate = () => {
      wb.messageSkipWaiting();
    };

    wb.register().catch((err) => {
      // Missing sw.js on some hosts (404) — don't spam the console as a failure.
      if (err instanceof TypeError && /404|bad HTTP response/i.test(String(err.message))) {
        return;
      }
      console.warn("[Lumina PWA] registration failed", err);
    });
  });
}
