import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Flame, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import {
  ENTITY_META,
  PICKABLE_KINDS,
  useEntitySnapshot,
  type EntityKind,
} from "@/lib/farewell/entities";
import { stripHtml } from "@/lib/lumina-timeline";


const VALID: EntityKind[] = [...PICKABLE_KINDS, "custom"];

export const Route = createFileRoute("/app/farewell/preview/$entity/$id")({
  ssr: false, // reads sessionStorage for custom entries
  beforeLoad: ({ params }) => {
    if (!VALID.includes(params.entity as EntityKind)) {
      throw redirect({ to: "/app/farewell", replace: true });
    }
  },
  component: PreviewPage,
});

function PreviewPage() {
  const { entity, id } = Route.useParams();
  const navigate = useNavigate();
  const kind = entity as EntityKind;
  const snap = useEntitySnapshot(kind, id);
  const [releasing, setReleasing] = useState(false);

  const meta = ENTITY_META[kind];

  if (!snap) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Nothing to release" subtitle="This item is no longer available." />
        <Link to="/app/farewell" className="text-sm text-primary underline">← Back to Farewell</Link>
      </div>
    );
  }

  const preview = stripHtml(snap.content || "").trim();

  const backClassName =
    "mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  const onRelease = () => {
    if (releasing) return;
    setReleasing(true);
    navigate({
      to: "/app/farewell/$entity/$id",
      params: { entity: kind, id },
      search: { ritual: "fire" },
    });
  };

  return (
    <div className="mx-auto max-w-2xl">
      {kind === "custom" ? (
        <Link to="/app/farewell/custom" className={backClassName} aria-label="Back to write farewell">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      ) : (
        <Link
          to="/app/farewell/pick/$category"
          params={{ category: kind }}
          className={backClassName}
          aria-label="Back to selection"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      )}
      <PageHeader
        eyebrow={`${meta.label} · Preview`}
        title={snap.title || "Untitled"}
        subtitle="Take a breath. Read it once more before letting it go."
      />

      <GlassCard className="p-5">
        <div className="max-h-[46vh] overflow-y-auto break-words rounded-2xl bg-white/40 p-4 text-sm leading-relaxed text-foreground/85 dark:bg-white/5">
          {(() => {
            const raw = (snap.content || "").trim();
            const lower = raw.toLowerCase();
            // Block SVG data URLs — they can execute script.
            const isSvgDataUrl = lower.startsWith("data:image/svg");
            const isImage =
              !isSvgDataUrl &&
              typeof raw === "string" &&
              (
                lower.startsWith("data:image/") ||
                lower.startsWith("blob:") ||
                /^https?:\/\/.+\.(png|jpe?g|gif|webp|avif|bmp)(\?[^#]*)?(#.*)?$/i.test(raw)
              );
            if (isImage) {
              return (
                <div className="flex justify-center">
                  <img
                    src={raw}
                    alt={snap.title || "Memory"}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    className="max-h-[42vh] w-auto max-w-full rounded-md object-contain"
                  />
                </div>
              );
            }
            return preview ? (
              <div className="whitespace-pre-wrap">{preview}</div>
            ) : (
              <span className="text-muted-foreground">No text — the ritual will honour it in silence.</span>
            );
          })()}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-[oklch(0.85_0.14_60_/_.5)] bg-[oklch(0.97_0.03_70_/_.7)] px-4 py-3 text-[13px] text-[oklch(0.4_0.13_35)] dark:border-[oklch(0.4_0.08_50_/_.4)] dark:bg-[oklch(0.24_0.05_30_/_.4)] dark:text-[oklch(0.88_0.08_55)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>Once released, this cannot be recovered. Nothing is deleted until the ritual completes.</div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Link
            to="/app/farewell"
            className="inline-flex min-h-11 items-center rounded-2xl border border-white/60 bg-white/60 px-4 text-sm text-muted-foreground transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/10 dark:bg-white/10"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={onRelease}
            disabled={releasing}
            aria-label="Release this memory"
            aria-disabled={releasing}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-gradient-to-br from-[oklch(0.72_0.2_40)] to-[oklch(0.55_0.22_25)] px-5 text-sm font-medium text-white shadow-[0_10px_28px_-14px_oklch(0.5_0.22_30_/_.7)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.85_0.16_55)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Flame className="h-4 w-4" /> Release
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

