import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { ImageViewer } from "@/components/lumina/ImageViewer";
import { RenameDialog } from "@/components/lumina/RenameDialog";
import { useLumina, type Memory } from "@/lib/lumina-store";
import { initialDisplayName } from "@/lib/filename";
import {
  prepareMediaFromFile,
  resolveFullImage,
  migrateLegacyMemory,
  deleteBlob,
  type ResolvedImage,
} from "@/lib/memory-media";

import { notify } from "@/lib/lumina-toasts";
import { Heart, ImagePlus, Pencil, Plus, X } from "lucide-react";

export const Route = createFileRoute("/app/memories/")({ component: MemoriesPage });

const tilts = [-2, 1.5, -1, 2.5, -2.2, 1];

function MemoriesPage() {
  const memories = useLumina((s) => s.memories);
  const addMemory = useLumina((s) => s.addMemory);
  const renameMemory = useLumina((s) => s.renameMemory);
  const updateMemoryMedia = useLumina((s) => s.updateMemoryMedia);
  const deleteMemory = useLumina((s) => s.deleteMemory);
  const toggleFavorite = useLumina((s) => s.toggleFavorite);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const releaseRef = useRef<null | (() => void)>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const fabInputRef = useRef<HTMLInputElement>(null);

  // Resolve the full-resolution image lazily when the viewer opens.
  // Legacy base64 records get migrated into the media store here too.
  useEffect(() => {
    if (!viewerId) {
      setViewerSrc(null);
      return;
    }
    let cancelled = false;
    const memory = memories.find((m) => m.id === viewerId);
    if (!memory) return;

    (async () => {
      let target: Pick<Memory, "src" | "storageKey" | "mimeType"> = memory;
      // Migrate legacy records transparently — the base64 payload leaves
      // the JSON store and moves into IndexedDB behind a thumbnail.
      if (!memory.storageKey && memory.src.startsWith("data:image/")) {
        try {
          const migrated = await migrateLegacyMemory(memory);
          if (migrated && !cancelled) {
            updateMemoryMedia(memory.id, {
              storageKey: migrated.storageKey,
              thumbnail: migrated.thumbnail,
              width: migrated.width,
              height: migrated.height,
              src: "",
            });
            target = { ...memory, ...migrated, src: "" };
          }
        } catch { /* fall through — legacy src still works */ }
      }

      const resolved: ResolvedImage | null = await resolveFullImage(target);
      if (cancelled) {
        resolved?.release();
        return;
      }
      releaseRef.current = resolved?.release ?? null;
      setViewerSrc(resolved?.url ?? null);
    })();

    return () => {
      cancelled = true;
      const r = releaseRef.current;
      releaseRef.current = null;
      if (r) r();
    };
  }, [viewerId, memories, updateMemoryMedia]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    if (!arr.length) return;
    let added = 0;
    (async () => {
      for (const f of arr) {
        try {
          const media = await prepareMediaFromFile(f);
          if (media) {
            addMemory({
              src: "",
              caption: initialDisplayName(f.name, f.type),
              originalFilename: f.name,
              mimeType: f.type || undefined,
              storageKey: media.storageKey,
              thumbnail: media.thumbnail,
              width: media.width,
              height: media.height,
            });
            added++;
          } else {
            // Formats the browser can't decode (rare — HEIC on non-Safari).
            // Fall back to the legacy base64 path so the upload still works.
            const dataUrl = await new Promise<string | null>((resolve) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result));
              r.onerror = () => resolve(null);
              r.readAsDataURL(f);
            });
            if (dataUrl) {
              addMemory({
                src: dataUrl,
                caption: initialDisplayName(f.name, f.type),
                originalFilename: f.name,
                mimeType: f.type || undefined,
              });
              added++;
            }
          }
        } catch {
          notify.error("Couldn't read that photo");
        }
      }
      if (added) notify.created(added === 1 ? "Memory" : `${added} memories`);
    })();
  };


  return (
    <div className="space-y-6 pb-32">
      <PageHeader
        eyebrow="little forever things"
        title="Memories"
        subtitle="A soft scrapbook of the moments you never want to forget."
        actions={
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] px-5 py-2.5 text-sm font-medium text-white shadow-md transition duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98]">
            <ImagePlus className="h-4 w-4" /> <span className="hidden sm:inline">Add photo</span><span className="sm:hidden">Add</span>
            <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
        }
      />

      {memories.length === 0 ? (
        <GlassCard className="!p-10 text-center">
          <div className="relative mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.95_0.08_340)] to-[oklch(0.9_0.08_290)] text-3xl shadow-inner dark:from-white/10 dark:to-white/5">
            <span aria-hidden>📸</span>
            <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 text-lg">✨</span>
          </div>
          <p className="font-display text-2xl leading-snug">Your story begins with one photo.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Drop a favourite here and it becomes a little Polaroid you can revisit anytime.
          </p>
          <label className="mt-6 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_60%,var(--accent))] px-5 py-2.5 text-xs font-medium uppercase tracking-widest text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98]">
            <ImagePlus className="h-3.5 w-3.5" /> Add your first photo
            <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
        </GlassCard>
      ) : (
        <div className="lumina-virtual-list grid grid-cols-2 gap-5 sm:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {memories.map((m, i) => {
            // Prefer the compact thumbnail; fall back to legacy base64
            // for records not yet migrated. Never decode the original in
            // a list render.
            const tileSrc = m.thumbnail || m.src;
            return (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, rotate: tilts[i % tilts.length] }}
              whileHover={{ rotate: 0, y: -6, scale: 1.03 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              className="lumina-elev-3 group relative cursor-pointer rounded-md bg-white p-2.5 pb-8 shadow-[0_18px_40px_-18px_rgba(30,20,60,0.35)] sm:p-3 sm:pb-9"
              onClick={() => setViewerId(m.id)}
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-neutral-100 dark:bg-white/5">
                <img
                  src={tileSrc}
                  alt={m.caption}
                  loading="lazy"
                  decoding="async"
                  width={m.width || undefined}
                  height={m.height || undefined}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
              <div className="mt-2.5 truncate text-center font-hand text-lg leading-snug text-[oklch(0.4_0.05_320)] sm:mt-3">
                {m.caption}
              </div>

              {/* Favorite — animated heart (larger touch target) */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  const was = !!m.favorite;
                  toggleFavorite("memory", m.id);
                  notify.favorited(!was);
                }}
                whileTap={{ scale: 0.85 }}
                aria-label={m.favorite ? "Unfavorite" : "Favorite"}
                aria-pressed={!!m.favorite}
                className="absolute left-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow-md ring-1 ring-black/5 transition hover:scale-110"
              >
                <motion.span
                  key={m.favorite ? "on" : "off"}
                  initial={{ scale: 0.6, opacity: 0.6 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 14 }}
                >
                  <Heart className={m.favorite ? "h-4 w-4 fill-rose-500 text-rose-500" : "h-4 w-4 text-muted-foreground"} />
                </motion.span>
              </motion.button>

              <div className="absolute right-2 top-2 flex gap-1.5 sm:hidden sm:group-hover:flex">
                <button
                  onClick={(e) => { e.stopPropagation(); setRenameTarget({ id: m.id, name: m.caption || "" }); }}
                  aria-label="Rename memory"
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow-md ring-1 ring-black/5 transition hover:scale-110"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Release the IDB blob before dropping the record.
                    if (m.storageKey) void deleteBlob(m.storageKey);
                    deleteMemory(m.id);
                    notify.deleted("Memory");
                  }}
                  aria-label="Delete memory"
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow-md ring-1 ring-black/5 transition hover:scale-110"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>


              {/* Metadata footer — visible on hover */}
              <div className="pointer-events-none absolute inset-x-2 bottom-1.5 flex items-center justify-center opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                <span className="rounded-full bg-black/55 px-2 py-0.5 text-[9px] uppercase tracking-widest text-white backdrop-blur">
                  {new Date(m.createdAt ?? Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </motion.div>
            );
          })}
        </div>
      )}

      {/* Floating upload FAB */}
      <button
        onClick={() => fabInputRef.current?.click()}
        aria-label="Add photo"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+96px)] right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.72_0.16_340)] to-[oklch(0.68_0.14_290)] text-white shadow-[0_16px_40px_-14px_color-mix(in_oklab,var(--primary)_65%,transparent)] transition duration-200 hover:-translate-y-1 hover:scale-105 active:scale-95 sm:bottom-8"
      >
        <Plus className="h-6 w-6" />
      </button>
      <input
        ref={fabInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Lightbox — full-resolution image resolved lazily on open. */}
      <ImageViewer src={viewerSrc} onClose={() => setViewerId(null)} />

      {/* Rename dialog */}
      <RenameDialog
        open={!!renameTarget}
        title="Rename memory"
        initialValue={renameTarget?.name ?? ""}
        onCancel={() => setRenameTarget(null)}
        onSave={(name) => {
          if (renameTarget) renameMemory(renameTarget.id, name);
          setRenameTarget(null);
        }}
      />
    </div>
  );
}
