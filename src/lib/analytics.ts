// Lightweight local analytics for Lumina.
// - Persists per-event counts + last timestamp in localStorage.
// - Dispatches a `lumina:analytics` CustomEvent so any external
//   provider (PostHog, Plausible, GA, etc.) can be wired later
//   without touching call sites.
//
// Read counters from anywhere via `getAnalyticsSnapshot()`.

const STORAGE_KEY = "lumina.analytics.v1";

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

type Snapshot = Record<string, { count: number; lastAt: string; lastProps?: AnalyticsProps }>;

function read(): Snapshot {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Snapshot;
  } catch {
    return {};
  }
}

function write(snap: Snapshot) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snap)); } catch {}
}

export function track(event: string, props?: AnalyticsProps) {
  const snap = read();
  const entry = snap[event] || { count: 0, lastAt: "" };
  entry.count += 1;
  entry.lastAt = new Date().toISOString();
  if (props) entry.lastProps = props;
  snap[event] = entry;
  write(snap);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("lumina:analytics", { detail: { event, props } }));
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[analytics]", event, props ?? {});
    }
  }
}

export function getAnalyticsSnapshot(): Snapshot {
  return read();
}

export function resetAnalytics() {
  write({});
}
