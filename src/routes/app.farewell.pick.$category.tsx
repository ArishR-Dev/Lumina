import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { EmptyState } from "@/components/lumina/EmptyState";
import {
  ENTITY_META, PICKABLE_KINDS, useEntityList, type EntityKind,
} from "@/lib/farewell/entities";

export const Route = createFileRoute("/app/farewell/pick/$category")({
  component: PickPage,
});

function PickPage() {
  const { category } = Route.useParams();
  const navigate = useNavigate();
  const kind = category as EntityKind;
  const valid = PICKABLE_KINDS.includes(kind);
  const meta = valid ? ENTITY_META[kind] : ENTITY_META.note;
  const items = useEntityList(valid ? kind : "note");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);
    if (!s) return sorted;
    return sorted.filter(
      (x) => x.title.toLowerCase().includes(s) || x.preview.toLowerCase().includes(s),
    );
  }, [items, q]);

  if (!valid) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Not found" subtitle="That category doesn't exist." />
        <Link to="/app/farewell" className="text-sm text-primary underline">← Back to Farewell</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/app/farewell"
        className="mb-3 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.24em] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>
      <PageHeader
        eyebrow={`Choose a ${meta.label.toLowerCase()}`}
        title={meta.plural}
        subtitle="Select the one you'd like to release."
      />

      <GlassCard className="p-3">
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${meta.plural.toLowerCase()}…`}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            aria-label={`Search ${meta.plural.toLowerCase()}`}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/60 dark:hover:bg-white/10"
            >
              <span aria-hidden className="text-lg leading-none">×</span>
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={`No ${meta.plural.toLowerCase()} yet`}
            message="Nothing here to release. Try another collection or write something to let go of."
          />
        ) : (
          <ul className="space-y-1.5 pr-1">
            {filtered.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/app/farewell/preview/$entity/$id",
                      params: { entity: kind, id: it.id },
                    })
                  }
                  className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition hover:border-white/60 hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:border-white/10 dark:hover:bg-white/10"
                >
                  <span aria-hidden className="mt-0.5 text-lg leading-none">{meta.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{it.title}</span>
                    {it.preview && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{it.preview}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
