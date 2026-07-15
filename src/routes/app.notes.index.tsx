import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Heart, LayoutGrid, List, Pin, Plus, Rows3, Search,
} from "lucide-react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { useLumina, type Note } from "@/lib/lumina-store";
import { stripHtml } from "@/lib/lumina-timeline";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/notes/")({ component: NotesPage });

type Filter = "all" | "pinned" | "favorites" | "archived" | "trash";
type View = "list" | "grid" | "compact";

function NotesPage() {
  const notes = useLumina((s) => s.notes);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("list");
  const isMobile = useIsMobile();

  // Precompute lowercase searchable haystacks once per notes change.
  // Search now reuses this index and doesn't re-lowercase on every keystroke.
  const haystacks = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of notes) map.set(n.id, (n.title + " " + stripHtml(n.content)).toLowerCase());
    return map;
  }, [notes]);

  const scoped = useMemo(
    () => notes.filter((n) => {
      if (filter === "trash") return n.trashed;
      if (n.trashed) return false;
      if (filter === "archived") return n.archived;
      if (n.archived) return false;
      if (filter === "pinned") return n.pinned;
      if (filter === "favorites") return n.favorite;
      return true;
    }),
    [notes, filter],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = needle
      ? scoped.filter((n) => haystacks.get(n.id)?.includes(needle))
      : scoped;
    return [...arr].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
  }, [scoped, haystacks, q]);


  const openNote = (id: string) => navigate({ to: "/app/notes/$id", params: { id } });
  const handleNew = () => navigate({ to: "/app/notes/new" });

  return (
    <div data-page="notes" className="pb-32">
      <PageHeader
        eyebrow="your soft archive"
        title="Notes"
        subtitle="Little pages for every thought, plan, and delight."
        actions={
          <button
            onClick={handleNew}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-md transition duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0"
            aria-label="New note"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New note</span><span className="sm:hidden">New</span>
          </button>
        }
      />

      <GlassCard className="!p-5 md:!p-6">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your notes…"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            aria-label="Search your notes"
            className="h-12 w-full rounded-2xl border border-white/80 bg-white/80 pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground transition focus:border-primary/60 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)] dark:border-white/15 dark:bg-white/10 dark:placeholder:text-muted-foreground"
          />
        </div>
        <div className="mb-4 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pr-8 text-[11px] no-scrollbar md:flex-wrap md:overflow-visible md:pb-0 md:pr-1">

          {(["all", "pinned", "favorites", "archived", "trash"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-2 uppercase tracking-widest transition duration-200",
                filter === f
                  ? "bg-primary/20 font-medium text-foreground shadow-sm"
                  : "text-foreground/60 hover:bg-white/60 hover:text-foreground dark:text-foreground/70 dark:hover:bg-white/10",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {visible.length} {visible.length === 1 ? "page" : "pages"}
          </span>
          <div className="hidden items-center gap-0.5 rounded-full bg-white/60 p-0.5 dark:bg-white/10 md:flex">
            {([
              ["list", List],
              ["grid", LayoutGrid],
              ["compact", Rows3],
            ] as const).map(([v, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-label={v}
                className={cn(
                  "grid h-7 w-8 place-items-center rounded-full transition duration-200",
                  view === v ? "bg-white text-foreground shadow-sm dark:bg-white/20" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
        <NoteList
          visible={visible}
          onSelect={openNote}
          view={isMobile ? "compact" : view}
          isMobile={isMobile}
          hasQuery={q.length > 0}
        />
      </GlassCard>
    </div>
  );
}


function NoteList({
  visible, onSelect, view, isMobile, hasQuery,
}: {
  visible: Note[];
  onSelect: (id: string) => void;
  view: View;
  isMobile?: boolean;
  hasQuery?: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isGrid = view === "grid";
  const columns = isGrid ? 2 : 1;
  const estimateSize = view === "compact" ? (isMobile ? 68 : 40) : view === "grid" ? 96 : 92;
  const rowCount = Math.ceil(visible.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 6,
  });

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/70 bg-white/30 px-6 py-10 text-center dark:border-white/10">
        <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.95_0.08_340)] to-[oklch(0.9_0.08_290)] text-2xl shadow-inner dark:from-white/10 dark:to-white/5">
          <span aria-hidden>📝</span>
          <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 text-sm">✨</span>
        </div>
        <p className="font-display text-xl leading-snug">
          {hasQuery ? "No pages match that." : "Your first note begins here."}
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          {hasQuery ? "Try a softer word or clear the search." : "A blank page is a kind place to start."}
        </p>
        {!hasQuery && (
          <Link
            to="/app/notes/new"
            className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] px-5 py-2.5 text-xs font-medium text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5" /> Create note
          </Link>
        )}
      </div>
    );
  }

  // When only a handful of notes exist, don't reserve a huge scroll area —
  // let the list size to its content so the card stays compact.
  const isSparse = visible.length <= 3;

  return (
    <div
      ref={parentRef}
      className={cn(
        "pr-1",
        isSparse
          ? ""
          : isMobile
            ? "max-h-[calc(100dvh-320px)] overflow-y-auto no-scrollbar"
            : "max-h-[70vh] overflow-y-auto",
      )}
    >
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((row) => {
          const start = row.index * columns;
          const items = visible.slice(start, start + columns);
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
                paddingBottom: 8,
              }}
              className={isGrid ? "grid grid-cols-2 gap-2" : ""}
            >
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onSelect(n.id)}
                  className={cn(
                    "block w-full rounded-2xl border border-white/50 text-left transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
                    isMobile ? "p-3.5" : view === "compact" ? "px-3 py-2" : "p-4",
                    "bg-white/50 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                  )}
                >
                  {isMobile ? (
                    <>
                      <div className="flex items-center gap-2">
                        {n.pinned && (
                          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-primary/15 px-2 text-[9px] font-medium uppercase tracking-widest text-primary">
                            <Pin className="h-2.5 w-2.5" /> pin
                          </span>
                        )}
                        <div className="min-w-0 flex-1 truncate text-[15px] font-medium leading-snug">{n.title || "Untitled"}</div>
                        {n.favorite && <Heart className="h-3.5 w-3.5 shrink-0 fill-rose-500 text-rose-500" />}
                      </div>
                      <div className="mt-1 truncate text-xs leading-snug text-muted-foreground">
                        {stripHtml(n.content).slice(0, 80) || "empty page…"}
                      </div>
                      <div className="mt-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                        {new Date(n.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    </>
                  ) : view === "compact" ? (
                    <div className="flex items-center gap-2">
                      {n.pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
                      <div className="min-w-0 flex-1 truncate text-sm">{n.title || "Untitled"}</div>
                      {n.favorite && <Heart className="h-3 w-3 shrink-0 fill-rose-500 text-rose-500" />}
                      <div className="shrink-0 text-[9px] uppercase tracking-widest text-muted-foreground">
                        {new Date(n.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  ) : isGrid ? (
                    <div className="flex h-full flex-col">
                      <div className="flex items-center gap-1.5">
                        {n.pinned && <Pin className="h-3 w-3 text-primary" />}
                        <div className="truncate text-sm font-medium leading-snug">{n.title || "Untitled"}</div>
                        {n.favorite && <Heart className="ml-auto h-3 w-3 shrink-0 fill-rose-500 text-rose-500" />}
                      </div>
                      <div className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
                        {stripHtml(n.content) || "empty page…"}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        {n.pinned && <Pin className="h-3 w-3 text-primary" />}
                        <div className="truncate font-medium leading-snug">{n.title || "Untitled"}</div>
                        {n.favorite && <Heart className="ml-auto h-3.5 w-3.5 fill-rose-500 text-rose-500" />}
                      </div>
                      <div className="mt-1.5 truncate text-xs leading-snug text-muted-foreground">
                        {stripHtml(n.content).slice(0, 90) || "empty page waiting for you"}
                      </div>
                      <div className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                        {new Date(n.updatedAt).toLocaleDateString()}
                      </div>
                    </>
                  )}
                </button>
              ))}

            </div>
          );
        })}
      </div>
    </div>
  );
}
