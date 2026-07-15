import { Cloud, CloudOff, Check, Loader2, AlertCircle } from "lucide-react";
import { useSyncStatus } from "@/lib/lumina-sync";
import { cn } from "@/lib/utils";

function formatAgo(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function SyncPill({ compact = false }: { compact?: boolean }) {
  const status = useSyncStatus((s) => s.status);
  const online = useSyncStatus((s) => s.online);
  const lastSyncedAt = useSyncStatus((s) => s.lastSyncedAt);
  const message = useSyncStatus((s) => s.message);
  const pendingCount = useSyncStatus((s) => s.pendingCount);

  const config = !online
    ? { icon: <CloudOff className="h-3.5 w-3.5" />, label: pendingCount ? `Offline · ${pendingCount} waiting` : "Offline", tone: "amber" as const }
    : status === "syncing"
      ? { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: pendingCount ? `Syncing ${pendingCount}…` : "Syncing…", tone: "primary" as const }
      : status === "error"
        ? { icon: <AlertCircle className="h-3.5 w-3.5" />, label: message ?? "Sync error", tone: "destructive" as const }
        : status === "synced"
          ? { icon: <Check className="h-3.5 w-3.5" />, label: `Synced · ${formatAgo(lastSyncedAt)}`, tone: "success" as const }
          : { icon: <Cloud className="h-3.5 w-3.5" />, label: "Ready", tone: "muted" as const };

  const toneClass = {
    primary: "text-primary",
    success: "text-[oklch(0.55_0.14_150)] dark:text-[oklch(0.75_0.14_150)]",
    amber: "text-[oklch(0.6_0.14_60)] dark:text-[oklch(0.78_0.14_70)]",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[config.tone];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-2.5 py-1 text-[11px] font-medium backdrop-blur transition dark:border-white/10 dark:bg-white/5",
        toneClass,
      )}
      role="status"
      aria-live="polite"
      title={config.label}
    >
      {config.icon}
      {!compact && <span className="truncate">{config.label}</span>}
    </div>
  );
}
