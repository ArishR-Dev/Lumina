import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileText, FileJson, FileArchive, Loader2 } from "lucide-react";

import { toast } from "sonner";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { useLumina } from "@/lib/lumina-store";
import { useShallow } from "zustand/react/shallow";
import { stripHtml } from "@/lib/lumina-timeline";
import { luminaDialog } from "@/lib/lumina-dialog";

export const Route = createFileRoute("/app/export")({ component: ExportPage });

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/<[^>]*>/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

function htmlToMd(html: string) {
  // Small heuristic converter — good enough for personal export.
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, s) =>
      s.split(/\n+/).map((l: string) => `> ${l.trim()}`).join("\n"),
    )
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1")
    .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ExportPage() {
  // Subscribe only to slice lengths for the counts widget — the export
  // actions themselves read fresh state via useLumina.getState() so
  // typing elsewhere in the app doesn't re-render this page.
  const counts = useLumina(
    useShallow((s) => ({
      notes: s.notes.length,
      journal: s.journal.length,
      thoughts: s.thoughts.length,
      letters: s.letters.length,
      memories: s.memories.length,
      tasks: s.tasks.length,
      habits: s.habits.length,
      moods: s.moods.length,
      capsules: s.capsules.length,
    })),
  );
  const [busy, setBusy] = useState<string | null>(null);

  const snapshot = () => {
    const state = useLumina.getState();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      prefs: {
        name: state.name,
        theme: state.theme,
        dark: state.dark,
        density: state.density,
        fontScale: state.fontScale,
      },
      notes: state.notes,
      journal: state.journal,
      thoughts: state.thoughts,
      letters: state.letters,
      memories: state.memories,
      tasks: state.tasks,
      habits: state.habits,
      moods: state.moods,
      capsules: state.capsules,
      scratch: state.scratch,
    };
  };

  const doJson = async () => {
    setBusy("json");
    const loading = luminaDialog.showLoading({
      title: "Preparing JSON archive…",
      description: "Serializing your entire Lumina.",
      skeleton: 3,
    });
    try {
      const blob = new Blob([JSON.stringify(snapshot(), null, 2)], {
        type: "application/json",
      });
      download(`lumina-${new Date().toISOString().slice(0, 10)}.json`, blob);
      toast.success("JSON archive downloaded");
    } finally {
      loading.close();
      setBusy(null);
    }
  };

  const doMarkdownZip = async () => {
    setBusy("md");
    const state = useLumina.getState();
    const loading = luminaDialog.showLoading({
      title: "Building Markdown archive…",
      description: "Loading zip engine…",
      progress: 0.02,
    });
    try {
      loading.update({ description: "Loading zip engine…", progress: 0.08 });
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      loading.update({ description: "Writing notes…", progress: 0.2 });
      const notes = zip.folder("notes")!;
      for (const n of state.notes) {
        const front = `---\ntitle: ${JSON.stringify(n.title)}\ncreated: ${new Date(
          n.createdAt,
        ).toISOString()}\nupdated: ${new Date(n.updatedAt).toISOString()}\ntags: ${(n.tags ?? []).join(", ")}\n---\n\n`;
        notes.file(`${slug(n.title)}-${n.id}.md`, front + htmlToMd(n.content));
      }
      loading.update({ description: "Writing journal…", progress: 0.4 });
      const journal = zip.folder("journal")!;
      for (const j of state.journal) {
        journal.file(
          `${j.date}.md`,
          `# ${j.date}\n\n**Mood:** ${j.mood}\n\n## Highlight\n${j.highlight}\n\n## Gratitude\n${j.gratitude}\n\n## Reflection\n${j.reflection}\n`,
        );
      }
      loading.update({ description: "Writing letters…", progress: 0.55 });
      const letters = zip.folder("letters")!;
      for (const l of state.letters) {
        letters.file(
          `${slug(l.to || "letter")}-${l.id}.md`,
          `# To ${l.to}\n_From ${l.from}_\n\n${htmlToMd(l.body)}\n`,
        );
      }
      zip.file(
        "thoughts.md",
        state.thoughts
          .map((t) => `- ${new Date(t.createdAt).toLocaleString()} — ${t.text}`)
          .join("\n"),
      );
      zip.file(
        "tasks.md",
        state.tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.text}`).join("\n"),
      );
      zip.file("data.json", JSON.stringify(snapshot(), null, 2));
      loading.update({ description: "Compressing archive…", progress: 0.7 });
      const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
        // meta.percent 0..100 — map into remaining 0.7 → 1.0 range
        loading.update({ progress: 0.7 + (meta.percent / 100) * 0.3 });
      });
      download(`lumina-${new Date().toISOString().slice(0, 10)}.zip`, blob);
      toast.success("Markdown archive downloaded");
    } finally {
      loading.close();
      setBusy(null);
    }
  };

  const doHtml = async () => {
    setBusy("html");
    const state = useLumina.getState();
    const loading = luminaDialog.showLoading({
      title: "Assembling HTML book…",
      description: "Threading your notes together.",
      skeleton: 3,
    });
    try {
      const style = `body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.7;color:#2a2032;background:#fff9fb}h1,h2,h3{font-family:'Playfair Display',serif;color:#6b2b58}article{border-top:1px solid #f0d8e5;padding:2rem 0}small{color:#9a8497}`;
      const notes = state.notes
        .map(
          (n) => `<article><h1>${escapeHtml(n.title || "Untitled")}</h1>
<small>${new Date(n.updatedAt).toLocaleString()}</small>
${n.content}
</article>`,
        )
        .join("\n");
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Lumina — ${escapeHtml(
        state.name,
      )}</title><style>${style}</style></head><body><h1 style="text-align:center">Lumina · ${escapeHtml(
        state.name,
      )}'s notes</h1>${notes}</body></html>`;
      download(
        `lumina-notes-${new Date().toISOString().slice(0, 10)}.html`,
        new Blob([html], { type: "text/html" }),
      );
      toast.success("HTML archive downloaded");
    } finally {
      loading.close();
      setBusy(null);
    }
  };

  const doPlain = async () => {
    setBusy("txt");
    const state = useLumina.getState();
    const loading = luminaDialog.showLoading({
      title: "Preparing plain-text digest…",
      description: "Distilling everything to prose.",
      skeleton: 2,
    });
    try {
      const lines: string[] = [`Lumina export · ${new Date().toLocaleString()}`, ""];
      lines.push(`# Notes (${state.notes.length})`);
      for (const n of state.notes) {
        lines.push(`\n## ${n.title || "Untitled"}`);
        lines.push(stripHtml(n.content));
      }
      lines.push(`\n# Journal (${state.journal.length})`);
      for (const j of state.journal) {
        lines.push(`\n## ${j.date} · ${j.mood}`);
        lines.push(`Highlight: ${j.highlight}`);
        lines.push(`Gratitude: ${j.gratitude}`);
        lines.push(`Reflection: ${j.reflection}`);
      }
      download(
        `lumina-${new Date().toISOString().slice(0, 10)}.txt`,
        new Blob([lines.join("\n")], { type: "text/plain" }),
      );
      toast.success("Plain text downloaded");
    } finally {
      loading.close();
      setBusy(null);
    }
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <PageHeader
        eyebrow="your data, your keepsake"
        title="Export Center"
        subtitle="Take everything with you, anytime. Nothing stays hidden."
      />

      <GlassCard className="mb-6">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Everything ready</div>
            <div className="mt-1 font-display text-3xl">{total} items</div>
          </div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-5">
            {Object.entries(counts).map(([k, v]) => (
              <div key={k}>
                <span className="text-foreground">{v}</span> {k}
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ExportCard
          icon={<FileJson className="h-5 w-5" />}
          title="JSON archive"
          subtitle="Complete portable copy, perfect for re-importing later."
          badge=".json"
          onClick={doJson}
          busy={busy === "json"}
        />
        <ExportCard
          icon={<FileArchive className="h-5 w-5" />}
          title="Markdown zip"
          subtitle="One file per note, journal entry & letter. Human friendly."
          badge=".zip"
          onClick={doMarkdownZip}
          busy={busy === "md"}
        />
        <ExportCard
          icon={<FileText className="h-5 w-5" />}
          title="HTML book"
          subtitle="Every note in a single elegant browsable page."
          badge=".html"
          onClick={doHtml}
          busy={busy === "html"}
        />
        <ExportCard
          icon={<FileText className="h-5 w-5" />}
          title="Plain text"
          subtitle="A gentle, unformatted digest of your writing."
          badge=".txt"
          onClick={doPlain}
          busy={busy === "txt"}
        />
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Exports run in your browser. Nothing is uploaded during export.
      </p>
    </div>
  );
}

function ExportCard({
  icon,
  title,
  subtitle,
  badge,
  onClick,
  busy,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <GlassCard>
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[oklch(0.94_0.08_340)] to-[oklch(0.9_0.06_300)] text-[oklch(0.4_0.1_320)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-display text-xl">{title}</div>
            <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground dark:bg-white/10">
              {badge}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <button
        onClick={onClick}
        disabled={busy}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-md transition hover:brightness-105 disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? "Preparing…" : "Download"}
      </button>
    </GlassCard>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
