import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Gift,
  Lock,
  Star,
  PackageCheck,
  Users,
  Search,
  Download,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { useAuth } from "@/lib/lumina-auth";
import { useAdminAccess } from "@/lib/admin-access";
import { luminaDialog } from "@/lib/lumina-dialog";
import { cn } from "@/lib/utils";
import {
  adminAdjustDays,
  adminListGiftProgress,
  adminMarkOpened,
  adminResetDays,
  adminSaveConfig,
  giftStatus,
  useSecretGift,
  type AdminGiftRow,
  type GiftStatus,
  type SecretGiftConfig,
} from "@/lib/secret-gift";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/admin/gifts")({
  component: GiftProgressTracker,
  ssr: false,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow, noarchive" }],
  }),
});

type Filter = "all" | GiftStatus;
type Tab = "tracker" | "settings";

function GiftProgressTracker() {
  const user = useAuth((s) => s.user);
  const loadingAuth = useAuth((s) => s.loading);
  const navigate = useNavigate();
  const clearSession = useAdminAccess((s) => s.clearSession);
  const config = useSecretGift((s) => s.config);
  const refreshConfig = useSecretGift((s) => s.refreshConfig);

  const [tab, setTab] = useState<Tab>("tracker");
  const [rows, setRows] = useState<AdminGiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"days" | "remaining" | "last">("days");
  const [selected, setSelected] = useState<AdminGiftRow | null>(null);
  const [accessReady, setAccessReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (loadingAuth) return;
    if (!user) {
      navigate({ to: "/app/home", replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      await refreshConfig();
      const active = useAdminAccess.getState().isSessionActive();
      const ok = active ? await useAdminAccess.getState().touchSession() : false;
      if (cancelled) return;
      if (!ok) {
        await useAdminAccess.getState().clearSession();
        navigate({ to: "/app/home", replace: true });
        return;
      }
      setAllowed(true);
      setAccessReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadingAuth, user, navigate, refreshConfig]);

  useEffect(() => {
    if (!allowed) return;
    const watchdog = window.setInterval(() => {
      void (async () => {
        const ok = await useAdminAccess.getState().touchSession();
        if (!ok) {
          await useAdminAccess.getState().clearSession();
          navigate({ to: "/app/home", replace: true });
        }
      })();
    }, 60_000);
    return () => window.clearInterval(watchdog);
  }, [allowed, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminListGiftProgress();
      setRows(list);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't load progress.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void load();
    void refreshConfig();
    const channel = supabase
      .channel("admin-secret-gift")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "secret_gift_progress" },
        () => {
          void load();
        },
      )
      .subscribe();
    const poll = window.setInterval(() => {
      void load();
    }, 45_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [allowed, load, refreshConfig]);

  const endSession = useCallback(async () => {
    await clearSession();
    navigate({ to: "/app/home", replace: true });
  }, [clearSession, navigate]);

  const reqDefault = config?.required_login_days ?? 90;

  const stats = useMemo(() => {
    const total = rows.length;
    let ready = 0,
      locked = 0,
      opened = 0,
      almost = 0;
    for (const r of rows) {
      const st = giftStatus({ ...r, required: r.required_login_days || reqDefault });
      if (st === "ready") ready++;
      else if (st === "opened") opened++;
      else if (st === "almost") almost++;
      else locked++;
    }
    return { total, ready, locked, opened, almost };
  }, [rows, reqDefault]);

  const filtered = useMemo(() => {
    let list = [...rows];
    if (filter !== "all") {
      list = list.filter(
        (r) => giftStatus({ ...r, required: r.required_login_days || reqDefault }) === filter,
      );
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (r) =>
          (r.display_name ?? "").toLowerCase().includes(needle) ||
          (r.email ?? "").toLowerCase().includes(needle),
      );
    }
    list.sort((a, b) => {
      const reqA = a.required_login_days || reqDefault;
      const reqB = b.required_login_days || reqDefault;
      if (sort === "days") return b.login_day_count - a.login_day_count;
      if (sort === "remaining") return reqA - a.login_day_count - (reqB - b.login_day_count);
      const ta = a.last_login_counted_date ?? "";
      const tb = b.last_login_counted_date ?? "";
      return tb.localeCompare(ta);
    });
    return list;
  }, [rows, filter, q, sort, reqDefault]);

  if (loadingAuth || !accessReady || !allowed) {
    return null;
  }

  const exportCsv = () => {
    const header =
      "Name,Email,Login Days,Required,Remaining,Status,Last Login,Unlocked At,Opened At\n";
    const body = filtered
      .map((r) => {
        const req = r.required_login_days || reqDefault;
        const st = giftStatus({ ...r, required: req });
        return [
          csv(r.display_name),
          csv(r.email),
          r.login_day_count,
          req,
          Math.max(0, req - r.login_day_count),
          st,
          r.last_login_counted_date ?? "",
          r.gift_unlocked_at ?? "",
          r.gift_opened_at ?? "",
        ].join(",");
      })
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `secret-gift-progress-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        eyebrow="sanctuary"
        title="Gift Progress Tracker"
        subtitle="Watch every Login Day — and tend the Secret Gift."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("tracker")}
              className={cn(
                "rounded-full px-4 py-2 text-sm",
                tab === "tracker"
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/50 dark:bg-white/5",
              )}
            >
              Tracker
            </button>
            <button
              type="button"
              onClick={() => setTab("settings")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm",
                tab === "settings"
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/50 dark:bg-white/5",
              )}
            >
              <Settings2 className="h-3.5 w-3.5" /> Gift settings
            </button>
            <button
              type="button"
              onClick={() => void endSession()}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/50 bg-white/40 px-4 py-2 text-sm text-muted-foreground hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              aria-label="End session"
            >
              <Lock className="h-3.5 w-3.5" /> Lock
            </button>
          </div>
        }
      />

      {tab === "settings" ? (
        <GiftSettingsForm onSaved={() => void refreshConfig()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Total Users"
              value={stats.total}
            />
            <StatCard
              icon={<Gift className="h-4 w-4" />}
              label="Ready to Open"
              value={stats.ready}
              tone="gold"
            />
            <StatCard icon={<Lock className="h-4 w-4" />} label="Locked" value={stats.locked} />
            <StatCard
              icon={<PackageCheck className="h-4 w-4" />}
              label="Opened"
              value={stats.opened}
              tone="green"
            />
            <StatCard
              icon={<Star className="h-4 w-4" />}
              label="Close (80+)"
              value={stats.almost}
              tone="star"
            />
          </div>

          <GlassCard className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name or email…"
                  className="w-full rounded-2xl border border-white/60 bg-white/60 py-2.5 pl-10 pr-3 text-sm outline-none dark:border-white/10 dark:bg-white/5"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "All"],
                    ["locked", "Locked"],
                    ["almost", "Almost"],
                    ["ready", "Ready"],
                    ["opened", "Opened"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs uppercase tracking-widest",
                      filter === id
                        ? "bg-primary/15 text-primary"
                        : "bg-white/40 text-muted-foreground dark:bg-white/5",
                    )}
                  >
                    {label}
                  </button>
                ))}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  className="rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-xs dark:border-white/10 dark:bg-white/5"
                >
                  <option value="days">Sort: Login Days</option>
                  <option value="remaining">Sort: Remaining</option>
                  <option value="last">Sort: Last Login</option>
                </select>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/50 dark:bg-white/5"
                  aria-label="Refresh"
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/50 px-3 text-xs dark:bg-white/5"
                >
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">Progress</th>
                    <th className="pb-2 font-medium">Remaining</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Last Login</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40 dark:divide-white/10">
                  {loading && !rows.length && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!loading && !filtered.length && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-muted-foreground">
                        No users match.
                      </td>
                    </tr>
                  )}
                  {filtered.map((r) => {
                    const req = r.required_login_days || reqDefault;
                    const st = giftStatus({ ...r, required: req });
                    const rem = Math.max(0, req - r.login_day_count);
                    const pct = Math.min(1, r.login_day_count / req);
                    return (
                      <tr key={r.user_id} className="align-middle">
                        <td className="py-3 pr-3">
                          <div className="font-medium">{r.display_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.email}</div>
                        </td>
                        <td className="py-3 pr-3">
                          <div className="mb-1 text-xs tabular-nums">
                            {r.login_day_count} / {req}
                          </div>
                          <div className="h-1.5 w-36 overflow-hidden rounded-full bg-white/50 dark:bg-white/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                              style={{ width: `${pct * 100}%` }}
                            />
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {Math.round(pct * 100)}%
                          </div>
                        </td>
                        <td className="py-3 pr-3 tabular-nums text-muted-foreground">{rem}</td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={st} />
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          {r.last_login_counted_date ?? "—"}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            <ActionBtn onClick={() => setSelected(r)}>View</ActionBtn>
                            <ActionBtn
                              onClick={async () => {
                                await adminAdjustDays(r.user_id, 1);
                                toast.success("+1 login day");
                                void load();
                              }}
                            >
                              +1
                            </ActionBtn>
                            <ActionBtn
                              onClick={async () => {
                                await adminAdjustDays(r.user_id, -1);
                                toast.success("−1 login day");
                                void load();
                              }}
                            >
                              −1
                            </ActionBtn>
                            <ActionBtn
                              onClick={async () => {
                                const ok = await luminaDialog.warning({
                                  title: "Reset login days?",
                                  description: `Clear progress for ${r.display_name || r.email}?`,
                                  confirmLabel: "Reset",
                                });
                                if (!ok) return;
                                await adminResetDays(r.user_id);
                                toast.success("Reset");
                                void load();
                              }}
                            >
                              Reset
                            </ActionBtn>
                            <ActionBtn
                              onClick={async () => {
                                await adminMarkOpened(r.user_id);
                                toast.success("Marked opened");
                                void load();
                              }}
                            >
                              Opened
                            </ActionBtn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      )}

      {selected && (
        <UserDetailModal
          row={selected}
          req={selected.required_login_days || reqDefault}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function GiftSettingsForm({ onSaved }: { onSaved: () => void }) {
  const config = useSecretGift((s) => s.config);
  const [draft, setDraft] = useState<Partial<SecretGiftConfig> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) setDraft({ ...config });
  }, [config]);

  if (!draft) {
    return <GlassCard>Loading settings…</GlassCard>;
  }

  const save = async () => {
    setSaving(true);
    try {
      const next = await adminSaveConfig({
        ...draft,
        image_urls: parseLines(
          String(
            (draft as { imageText?: string }).imageText ?? (draft.image_urls ?? []).join("\n"),
          ),
        ),
        video_urls: parseLines(
          String(
            (draft as { videoText?: string }).videoText ?? (draft.video_urls ?? []).join("\n"),
          ),
        ),
        audio_urls: parseLines(
          String(
            (draft as { audioText?: string }).audioText ?? (draft.audio_urls ?? []).join("\n"),
          ),
        ),
        admin_emails: String(
          (draft as { adminText?: string }).adminText ?? (draft.admin_emails ?? []).join(","),
        )
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (next) toast.success("Gift settings saved");
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard className="space-y-4">
      <Field label="Required Login Days">
        <input
          type="number"
          min={1}
          value={draft.required_login_days ?? 90}
          onChange={(e) =>
            setDraft({ ...draft, required_login_days: Number(e.target.value) || 90 })
          }
          className="field"
        />
      </Field>
      <Field label="Gift Title">
        <input
          value={draft.gift_title ?? ""}
          onChange={(e) => setDraft({ ...draft, gift_title: e.target.value })}
          className="field"
        />
      </Field>
      <Field label="Gift Description">
        <textarea
          rows={2}
          value={draft.gift_description ?? ""}
          onChange={(e) => setDraft({ ...draft, gift_description: e.target.value })}
          className="field"
        />
      </Field>
      <Field label="Custom Message">
        <textarea
          rows={3}
          value={draft.custom_message ?? ""}
          onChange={(e) => setDraft({ ...draft, custom_message: e.target.value })}
          className="field"
        />
      </Field>
      <Field label="Image URLs (one per line)">
        <textarea
          rows={3}
          defaultValue={(draft.image_urls ?? []).join("\n")}
          onChange={(e) => setDraft({ ...draft, imageText: e.target.value } as typeof draft)}
          className="field font-mono text-xs"
        />
      </Field>
      <Field label="Video URLs (one per line)">
        <textarea
          rows={2}
          defaultValue={(draft.video_urls ?? []).join("\n")}
          onChange={(e) => setDraft({ ...draft, videoText: e.target.value } as typeof draft)}
          className="field font-mono text-xs"
        />
      </Field>
      <Field label="Audio URLs (one per line)">
        <textarea
          rows={2}
          defaultValue={(draft.audio_urls ?? []).join("\n")}
          onChange={(e) => setDraft({ ...draft, audioText: e.target.value } as typeof draft)}
          className="field font-mono text-xs"
        />
      </Field>
      <Field label="Animation key">
        <select
          value={draft.animation_key ?? "cinematic-unlock"}
          onChange={(e) => setDraft({ ...draft, animation_key: e.target.value })}
          className="field"
        >
          <option value="cinematic-unlock">Cinematic unlock (default)</option>
          <option value="soft-fade">Soft fade</option>
          <option value="simple-pop">Simple pop</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.one_time !== false}
          onChange={(e) => setDraft({ ...draft, one_time: e.target.checked })}
        />
        One-time gift (recommended)
      </label>
      <Field label="Session timeout (minutes of inactivity)">
        <input
          type="number"
          min={5}
          max={480}
          value={draft.admin_session_minutes ?? 30}
          onChange={(e) =>
            setDraft({ ...draft, admin_session_minutes: Number(e.target.value) || 30 })
          }
          className="field"
        />
      </Field>
      <Field label="Admin emails (comma-separated, legacy)">
        <textarea
          rows={2}
          defaultValue={(draft.admin_emails ?? []).join(", ")}
          onChange={(e) => setDraft({ ...draft, adminText: e.target.value } as typeof draft)}
          className="field font-mono text-xs"
        />
      </Field>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save gift settings"}
      </button>
      <style>{`
        .field {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid color-mix(in oklab, white 60%, transparent);
          background: color-mix(in oklab, white 55%, transparent);
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          outline: none;
        }
        .dark .field {
          border-color: color-mix(in oklab, white 10%, transparent);
          background: color-mix(in oklab, white 5%, transparent);
        }
      `}</style>
    </GlassCard>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function parseLines(s: string) {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function csv(v: string | null | undefined) {
  const s = v ?? "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: "gold" | "green" | "star";
}) {
  return (
    <GlassCard className="!p-4">
      <div
        className={cn(
          "mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl",
          tone === "gold" && "bg-[oklch(0.9_0.12_85_/0.25)] text-[oklch(0.55_0.12_70)]",
          tone === "green" && "bg-emerald-500/15 text-emerald-600",
          tone === "star" && "bg-amber-500/15 text-amber-600",
          !tone && "bg-primary/10 text-primary",
        )}
      >
        {icon}
      </div>
      <div className="font-display text-2xl tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </GlassCard>
  );
}

function StatusBadge({ status }: { status: GiftStatus }) {
  const map: Record<GiftStatus, string> = {
    locked: "🔒 Locked",
    almost: "⭐ Almost There",
    ready: "🎁 Ready",
    opened: "✅ Gift Opened",
  };
  return (
    <span className="inline-flex rounded-full bg-white/50 px-2.5 py-1 text-[10px] uppercase tracking-widest dark:bg-white/10">
      {map[status]}
    </span>
  );
}

function ActionBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-white/50 px-2.5 py-1 text-[11px] hover:bg-white/70 dark:bg-white/10"
    >
      {children}
    </button>
  );
}

function UserDetailModal({
  row,
  req,
  onClose,
}: {
  row: AdminGiftRow;
  req: number;
  onClose: () => void;
}) {
  const st = giftStatus({ ...row, required: req });
  const rem = Math.max(0, req - row.login_day_count);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
    >
      <GlassCard className="w-full max-w-md space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-2xl">{row.display_name || "User"}</div>
            <div className="text-sm text-muted-foreground">{row.email}</div>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">
            Close
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Login Days</dt>
            <dd className="font-medium">
              {row.login_day_count} / {req}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Remaining</dt>
            <dd className="font-medium">{rem}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Progress</dt>
            <dd className="font-medium">
              {Math.round(Math.min(1, row.login_day_count / req) * 100)}%
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <StatusBadge status={st} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">First Login</dt>
            <dd>{row.first_login_date ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last Login</dt>
            <dd>{row.last_login_counted_date ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Unlocked</dt>
            <dd>{row.gift_unlocked_at ? new Date(row.gift_unlocked_at).toLocaleString() : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Opened</dt>
            <dd>{row.gift_opened_at ? new Date(row.gift_opened_at).toLocaleString() : "—"}</dd>
          </div>
        </dl>
      </GlassCard>
    </motion.div>
  );
}
