import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Upload, Search, X, Trash2, Heart, Pencil, Play, Download, Lock, LockOpen,
  FileText, StickyNote, Grid3x3, List, ChevronLeft, ChevronRight, FolderInput, Fingerprint, KeyRound, Mic, Square,
} from "lucide-react";


import { toast } from "sonner";

import { GlassCard } from "@/components/lumina/GlassCard";
import { luminaDialog } from "@/lib/lumina-dialog";
import { cn } from "@/lib/utils";
import { vault, type VaultItem } from "@/lib/private-album/vault";
import { useLumina } from "@/lib/lumina-store";
import { stripHtml } from "@/lib/lumina-timeline";
import {
  isAlbumUnlocked, lockAlbum, useAlbumUnlocked,
  hasPin, setPin, verifyPin, clearPin, normalizePin,
  isBiometricSupported, hasBiometric, enableBiometric, disableBiometric, verifyBiometric,
  getForgotQuestion, hasCustomForgotChallenge, setForgotChallenge, verifyForgotAnswer, clearForgotChallenge,
} from "@/lib/private-album/session";


export const Route = createFileRoute("/app/private")({
  component: PrivateAlbum,
  beforeLoad: () => {
    // Hidden feature: if the session isn't unlocked, silently bounce home.
    // Preserves the "invisible unless you know the gesture" contract.
    // /app is ssr:false, so window is always defined here.
    if (!isAlbumUnlocked()) throw redirect({ to: "/app/home" });
  },
});



function PrivateAlbum() {
  const navigate = useNavigate();
  const unlocked = useAlbumUnlocked();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [favOnly, setFavOnly] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pinPromptFor, setPinPromptFor] = useState<"open" | "set" | "clear" | null>(
    hasPin() ? "open" : null,
  );
  const [pinEntered, setPinEntered] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetQuestion, setResetQuestion] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pinPresent, setPinPresent] = useState(() => hasPin());
  const reduceMotion = useReducedMotion();
  const [entryFx, setEntryFx] = useState(() => {
    try { return !reduceMotion && sessionStorage.getItem("lumina.privateAlbum.justEntered") === "1"; }
    catch { return false; }
  });


  useEffect(() => {
    if (!entryFx) return;
    try { sessionStorage.removeItem("lumina.privateAlbum.justEntered"); } catch { /* ignore */ }
    const t = window.setTimeout(() => setEntryFx(false), 900);
    return () => window.clearTimeout(t);
  }, [entryFx]);



  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await vault.list();
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hasPin() || pinEntered) refresh();
  }, [pinEntered, refresh]);

  // Lock again on route leave — the vault is sensitive; don't leave doors open.
  useEffect(() => () => { /* keep unlocked for session, but PIN re-prompts next mount */ }, []);

  const filtered = useMemo(() => {
    let arr = items;
    if (favOnly) arr = arr.filter((i) => i.favorite);
    if (q.trim()) {
      const needle = q.toLowerCase();
      arr = arr.filter((i) =>
        i.name.toLowerCase().includes(needle) ||
        (i.originalFilename?.toLowerCase().includes(needle) ?? false),
      );
    }
    const sorted = [...arr];
    sorted.sort((a, b) => b.createdAt - a.createdAt);
    return sorted;
  }, [items, favOnly, q]);


  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    const total = arr.length;
    let done = 0;
    const loading = luminaDialog.showLoading({
      title: total === 1 ? "Adding to your vault…" : `Adding ${total} items to your vault…`,
      description: arr[0].name,
      progress: 0,
    });
    try {
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        loading.update({ description: f.name, progress: i / total });
        try { await vault.addFile(f); done++; }
        catch (e) { console.error(e); toast.error(`Couldn't add ${f.name}`); }
      }
      loading.update({ progress: 1 });
      await refresh();
      toast.success(`Added ${done} ${done === 1 ? "item" : "items"}${done < total ? ` (${total - done} failed)` : ""}`);
    } finally {
      loading.close();
    }
  }, [refresh]);

  // PIN gate — locks reads until the correct PIN is entered.
  if (!unlocked) return null;
  if (pinPromptFor === "open" && !pinEntered) {
    return (
      <>
        <PinPrompt
          title="Enter PIN"
          subtitle="This space is protected."
          onSubmit={async (pin) => {
            const ok = await verifyPin(pin);
            if (ok) { setPinEntered(true); setPinPromptFor(null); return true; }
            return false;
          }}
          onBiometric={async () => {
            const ok = await verifyBiometric();
            if (ok) { setPinEntered(true); setPinPromptFor(null); }
            return ok;
          }}
          onCancel={() => { lockAlbum(); navigate({ to: "/app/home" }); }}
          onForgot={hasCustomForgotChallenge() ? async () => {
            // Only offered when the user has configured a recovery
            // challenge. There is no default fallback question/answer.
            const q = getForgotQuestion();
            if (!q) return;
            // Step 1 — confirm the user really wants to reset.
            const ack = await luminaDialog.warning({
              title: "Reset your PIN?",
              description: "This removes the PIN lock on this device. Your vault items are kept — you can set a new PIN afterwards.",
              confirmLabel: "Continue",
            });
            if (!ack) return;
            setResetQuestion(q);
            setResetOpen(true);
          } : undefined}
        />
        <AnimatePresence>
          {resetOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Verify PIN reset"
            >
              <PinResetVerify
                question={resetQuestion || getForgotQuestion() || ""}
                onCancel={() => setResetOpen(false)}
                onConfirm={() => {
                  // Security: resetting the PIN must NOT grant vault access.
                  // Clear the PIN + biometric, lock the album, and send the
                  // user back home. They must re-enter through the secret
                  // gesture and set a new PIN before browsing items.
                  clearPin();
                  disableBiometric();
                  setResetOpen(false);
                  lockAlbum();
                  toast.success("PIN reset. Re-open the vault to set a new one.");
                  navigate({ to: "/app/home" });
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }


  const previewItem = filtered.find((i) => i.id === previewId) ?? items.find((i) => i.id === previewId) ?? null;

  // Initial load — centered, calm loading screen instead of a stretched
  // skeleton. Only shown before the first fetch completes on mobile-friendly
  // vertical centering; subsequent refreshes just re-render the grid.
  const isFirstLoad = loading && items.length === 0;

  return (
    <div
      data-page="private-album"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
      }}
      className="relative overflow-x-hidden pb-[max(6rem,env(safe-area-inset-bottom))] md:pb-0"
      style={{
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >

      <AnimatePresence>
        {entryFx && (
          <motion.div
            key="entry-curtain"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
            aria-hidden
          >
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: "-100%" }}
              transition={{ duration: 0.75, ease: [0.76, 0, 0.24, 1], delay: 0.05 }}
              className="absolute inset-x-0 top-0 h-1/2"
              style={{ background: "linear-gradient(180deg, oklch(0.08 0.05 285) 0%, oklch(0.14 0.06 290) 100%)" }}
            />
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: "100%" }}
              transition={{ duration: 0.75, ease: [0.76, 0, 0.24, 1], delay: 0.05 }}
              className="absolute inset-x-0 bottom-0 h-1/2"
              style={{ background: "linear-gradient(0deg, oklch(0.08 0.05 285) 0%, oklch(0.14 0.06 290) 100%)" }}
            />
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: [0, 1, 0], scaleX: [0, 1, 1] }}
              transition={{ duration: 0.75, times: [0, 0.4, 1], ease: "easeOut" }}
              className="absolute left-0 right-0 top-1/2 h-px origin-center"
              style={{
                background:
                  "linear-gradient(90deg, transparent, oklch(0.92 0.14 85 / 0.9) 50%, transparent)",
                boxShadow: "0 0 24px oklch(0.85 0.18 320 / 0.6)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={entryFx ? { opacity: 0, y: 18, filter: "blur(6px)" } : false}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.55, delay: entryFx ? 0.35 : 0, ease: [0.22, 1, 0.36, 1] }}

        className="space-y-4 sm:space-y-6"
      >

      <header className="mb-0 sm:mb-1">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground dark:bg-white/5">
          <Lock className="h-3 w-3" aria-hidden />
          <span className="whitespace-nowrap">your private space</span>
        </div>
        <h1 className="font-display text-[1.65rem] leading-[1.1] text-foreground sm:text-5xl">
          Private Album
        </h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground sm:mt-3 sm:text-base">
          Photos, memories, thoughts — kept quietly on this device.
        </p>
      </header>

      {/* Action row — horizontal snap-scroll on small screens, wraps on larger.
          Padding uses safe-area insets so first/last buttons never clip.
          A soft right-edge fade hints at overflow on mobile. */}
      <div className="relative">
      <div
        role="toolbar"
        aria-label="Private album actions"
        className="-mx-[max(1rem,env(safe-area-inset-left))] -mr-[max(1rem,env(safe-area-inset-right))] flex flex-nowrap items-center gap-3 overflow-x-auto scroll-smooth pb-1 no-scrollbar [scroll-snap-type:x_mandatory] sm:mx-0 sm:mr-0 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:pb-0"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(2.5rem, env(safe-area-inset-right))",
          scrollPaddingLeft: "max(1rem, env(safe-area-inset-left))",
          scrollPaddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >

        <button
          onClick={() => inputRef.current?.click()}
          aria-label="Upload"
          className="lumina-focus-ring inline-flex h-12 min-w-[120px] shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.62_0.18_290)] to-[oklch(0.52_0.2_270)] px-5 text-sm font-medium text-white shadow-lg shadow-[oklch(0.5_0.2_280)]/25 transition [scroll-snap-align:start] hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-[0.98]"
        >
          <Upload className="h-4 w-4" /> <span>Upload</span>
        </button>
        <button
          onClick={() => setNoteOpen(true)}
          aria-label="New note"
          className="lumina-focus-ring inline-flex h-12 min-w-[120px] shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full border border-white/60 bg-white/60 px-4 text-sm font-medium text-foreground/80 backdrop-blur transition [scroll-snap-align:start] hover:-translate-y-0.5 hover:bg-white/80 active:translate-y-0 active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <StickyNote className="h-4 w-4" /> <span>Note</span>
        </button>
        <button
          onClick={() => setVoiceOpen(true)}
          aria-label="Record voice"
          className="lumina-focus-ring inline-flex h-12 min-w-[120px] shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full border border-white/60 bg-white/60 px-4 text-sm font-medium text-foreground/80 backdrop-blur transition [scroll-snap-align:start] hover:-translate-y-0.5 hover:bg-white/80 active:translate-y-0 active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <Mic className="h-4 w-4" /> <span>Voice</span>
        </button>
        <button
          onClick={() => setImportOpen(true)}
          aria-label="Import"
          className="lumina-focus-ring inline-flex h-12 min-w-[120px] shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full border border-white/60 bg-white/60 px-4 text-sm font-medium text-foreground/80 backdrop-blur transition [scroll-snap-align:start] hover:-translate-y-0.5 hover:bg-white/80 active:translate-y-0 active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <FolderInput className="h-4 w-4" /> <span>Import</span>
        </button>
        <button
          onClick={() => { lockAlbum(); navigate({ to: "/app/home" }); }}
          aria-label="Lock private album"
          className="lumina-focus-ring inline-flex h-12 min-w-[120px] shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full border border-white/60 bg-white/50 px-4 text-sm text-foreground/80 backdrop-blur transition [scroll-snap-align:start] hover:-translate-y-0.5 hover:bg-white/70 active:translate-y-0 active:scale-[0.98] dark:border-white/10 dark:bg-white/5"
        >
          <Lock className="h-4 w-4" /> <span>Lock</span>
        </button>

      </div>
        <div aria-hidden className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-white/70 to-transparent dark:from-neutral-950/50 sm:hidden" />
      </div>


      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />


      <GlassCard className="p-3 md:p-4">
        {/* Search — always full width, then grouped controls below on mobile.
            Sections use fieldset groupings so wrapping is predictable. */}
        <div className="mb-3 space-y-2 sm:space-y-3">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search your vault…"
              aria-label="Search vault"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              className="lumina-focus-ring h-12 w-full rounded-2xl border border-white/60 bg-white/60 pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground transition focus:border-primary/50 dark:border-white/10 dark:bg-white/5"
            />
          </div>

          {/* Grouped toolbar controls — Library group first, Security group
              drops to its own row on narrow screens for cleaner wrapping. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Library group: view + favorites */}
            <div
              role="group"
              aria-label="Library"
              className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
            >
              <div className="flex overflow-hidden rounded-2xl border border-white/60 bg-white/60 dark:border-white/10 dark:bg-white/5">
                <button
                  onClick={() => setView("grid")}
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                  className={cn("lumina-focus-ring grid h-11 w-11 place-items-center touch-manipulation transition", view === "grid" && "bg-primary/15 text-primary")}
                >
                  <Grid3x3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView("list")}
                  aria-label="List view"
                  aria-pressed={view === "list"}
                  className={cn("lumina-focus-ring grid h-11 w-11 place-items-center touch-manipulation transition", view === "list" && "bg-primary/15 text-primary")}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={() => setFavOnly((v) => !v)}
                aria-pressed={favOnly}
                className={cn(
                  "lumina-focus-ring inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-2xl border border-white/60 bg-white/60 px-3 text-sm dark:border-white/10 dark:bg-white/5",
                  favOnly && "border-[oklch(0.7_0.2_20)]/60 text-[oklch(0.7_0.2_20)]",
                )}
              >
                <Heart className={cn("h-4 w-4", favOnly && "fill-[oklch(0.7_0.2_20)]")} /> Favorites
              </button>
            </div>

            {/* Security group: PIN + recovery — own row on mobile so buttons
                (Change PIN / Remove PIN / Biometric / Recovery) never clip. */}
            <div
              role="group"
              aria-label="Security"
              className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
            >
              <PinControl
                hasPin={pinPresent}
                onSet={async (pin) => {
                  await setPin(pin);
                  setPinPresent(true);
                  toast.success("PIN set");
                  // First-time setup — offer to configure recovery, or skip.
                  // If skipped, "Forgot PIN?" stays hidden until the user
                  // explicitly sets a challenge from the security bar.
                  if (!hasCustomForgotChallenge()) {
                    const setup = await luminaDialog.warning({
                      title: "Set a recovery question?",
                      description: "Without a recovery question, forgetting your PIN means clearing the vault. You can set one later from the security row.",
                      confirmLabel: "Set now",
                      cancelLabel: "Skip",
                    });
                    if (setup) openRecoverySetup();
                  }
                }}
                onChange={async (pin) => { await setPin(pin); setPinPresent(true); toast.success("PIN updated"); }}
                onClear={() => { clearPin(); disableBiometric(); setPinPresent(false); toast("PIN removed"); }}
              />
              <ForgotChallengeControl />
            </div>
          </div>
        </div>

        {/* Gallery — cross-fades in from the loading state to avoid a jump. */}
        <div className="relative mt-1">
          <AnimatePresence mode="wait" initial={false}>
            {isFirstLoad ? (
              <motion.div
                key="loading-gate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <PrivateLoadingGate />
              </motion.div>
            ) : (
              <motion.div
                key="gallery"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                {items.length === 0 ? (
                  <EmptyState onUpload={() => inputRef.current?.click()} />
                ) : filtered.length === 0 ? (
                  <div className="grid place-items-center py-16 text-sm text-muted-foreground">Nothing matches that search.</div>
                ) : view === "grid" ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    <AnimatePresence>
                      {filtered.map((it) => (
                        <ItemTile key={it.id} item={it} onOpen={() => setPreviewId(it.id)} onChanged={refresh} />
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/50 dark:divide-white/10">
                    {filtered.map((it) => (
                      <ItemRow key={it.id} item={it} onOpen={() => setPreviewId(it.id)} onChanged={refresh} />
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>


      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-black/40 backdrop-blur-sm"
          >
            <div className="rounded-3xl border-2 border-dashed border-white/60 bg-white/10 px-8 py-6 text-lg text-white">
              Drop to add to your vault
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewItem && (
          <Preview
            item={previewItem}
            items={filtered.length ? filtered : items}
            onClose={() => setPreviewId(null)}
            onChanged={refresh}
            onNavigate={(id) => setPreviewId(id)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {noteOpen && (
          <NoteDialog
            onSave={async (name, text) => {
              await vault.addNote(name, text);
              await refresh();
              setNoteOpen(false);
              toast.success("Note saved to your vault");
            }}
            onClose={() => setNoteOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {voiceOpen && (
          <VoiceDialog
            onSave={async (file) => {
              await vault.addFile(file);
              await refresh();
              setVoiceOpen(false);
              toast.success("Voice memo saved");
            }}
            onClose={() => setVoiceOpen(false)}
          />
        )}
      </AnimatePresence>


      <AnimatePresence>
        {importOpen && (
          <ImportDialog
            onDone={async (count) => {
              await refresh();
              setImportOpen(false);
              if (count > 0) toast.success(`Imported ${count} item${count === 1 ? "" : "s"}`);
            }}
            onClose={() => setImportOpen(false)}
          />
        )}
      </AnimatePresence>
      </motion.div>
    </div>
  );
}


// ---------- Tiles / rows ----------

function ItemTile({ item, onOpen, onChanged }: { item: VaultItem; onOpen: () => void; onChanged: () => Promise<void> }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      className="group relative aspect-square overflow-hidden rounded-2xl border border-white/60 bg-white/40 dark:border-white/10 dark:bg-white/5"
    >
      <button type="button" onClick={onOpen} className="absolute inset-0 grid place-items-center text-center" aria-label={`Open ${item.name}`}>
        {item.thumb ? (
          <Thumb src={item.thumb} alt={item.name} />
        ) : (
          <TypeGlyph item={item} />
        )}
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-[11px] text-white">
        <div className="truncate">{item.name}</div>
      </div>
      <button
        type="button"
        onClick={async () => { await vault.toggleFavorite(item.id); await onChanged(); }}
        aria-label={item.favorite ? "Unfavorite" : "Favorite"}
        className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
      >
        <Heart className={cn("h-4 w-4", item.favorite && "fill-[oklch(0.75_0.2_20)] text-[oklch(0.75_0.2_20)]")} />
      </button>
    </motion.div>
  );
}

function ItemRow({ item, onOpen, onChanged }: { item: VaultItem; onOpen: () => void; onChanged: () => Promise<void> }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/60 dark:bg-white/5">
          {item.thumb ? <Thumb src={item.thumb} alt={item.name} /> : <TypeGlyph item={item} small />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{item.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {item.kind} · {formatSize(item.size)} · {new Date(item.createdAt).toLocaleDateString()}
          </div>
        </div>
      </button>
      <button
        onClick={async () => { await vault.toggleFavorite(item.id); await onChanged(); }}
        aria-label={item.favorite ? "Unfavorite" : "Favorite"}
        className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/60 dark:hover:bg-white/10"
      >
        <Heart className={cn("h-4 w-4", item.favorite && "fill-[oklch(0.7_0.2_20)] text-[oklch(0.7_0.2_20)]")} />
      </button>
    </li>
  );
}

function TypeGlyph({ item, small }: { item: VaultItem; small?: boolean }) {
  const cls = small ? "h-5 w-5" : "h-10 w-10";
  const label = small ? "" : item.kind;
  const Icon = item.kind === "audio" ? Play : item.kind === "note" ? StickyNote : item.kind === "video" ? Play : FileText;
  return (
    <div className="flex flex-col items-center gap-1 text-muted-foreground">
      <Icon className={cls} />
      {label && <span className="text-[10px] uppercase tracking-widest">{label}</span>}
    </div>
  );
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ---------- Preview ----------

function Preview({
  item, items, onClose, onChanged, onNavigate,
}: {
  item: VaultItem;
  items: VaultItem[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onNavigate: (id: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(item.name);

  useEffect(() => {
    setName(item.name);
    let alive = true;
    let created: string | null = null;
    (async () => {
      if (item.kind === "note") { setUrl(null); return; }
      const u = await vault.getBlobUrl(item.id);
      if (!alive) { if (u) URL.revokeObjectURL(u); return; }
      created = u;
      setUrl(u);
    })();
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [item.id, item.kind, item.name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") { const i = items.findIndex((x) => x.id === item.id); if (i >= 0 && items[i + 1]) onNavigate(items[i + 1].id); }
      if (e.key === "ArrowLeft")  { const i = items.findIndex((x) => x.id === item.id); if (i > 0) onNavigate(items[i - 1].id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item.id, items, onNavigate, onClose]);

  const idx = items.findIndex((x) => x.id === item.id);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < items.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" onClick={onClose} aria-label="Close preview" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <X className="h-5 w-5" />
      </button>
      {hasPrev && (
        <button type="button" onClick={() => onNavigate(items[idx - 1].id)} aria-label="Previous" className="absolute left-4 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {hasNext && (
        <button type="button" onClick={() => onNavigate(items[idx + 1].id)} aria-label="Next" className="absolute right-4 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        className="mx-2 flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-neutral-950 text-white shadow-2xl sm:mx-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="grid place-items-center bg-black" style={{ minHeight: "40vh" }}>
          {item.kind === "image" && url && <img src={url} alt={item.name} className="max-h-[70vh] w-auto object-contain" />}
          {item.kind === "video" && url && <video src={url} controls autoPlay className="max-h-[70vh] w-full" />}
          {item.kind === "audio" && url && <audio src={url} controls autoPlay className="w-full max-w-md" />}
          {item.kind === "note" && (
            <div className="max-h-[60vh] w-full overflow-auto whitespace-pre-wrap p-6 text-sm leading-relaxed">
              {item.text}
            </div>
          )}
          {(item.kind === "document" || item.kind === "other") && url && (
            <div className="p-8 text-center">
              <FileText className="mx-auto h-12 w-12 text-white/70" />
              <div className="mt-3">{item.name}</div>
              <a href={url} download={item.originalFilename || item.name} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm hover:bg-white/25">
                <Download className="h-4 w-4" /> Download
              </a>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto border-t border-white/10 bg-neutral-900/80 px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:px-4">
          {renaming ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await vault.rename(item.id, name.trim() || "Untitled");
                await onChanged();
                setRenaming(false);
                toast.success("Renamed");
              }}
              className="flex flex-1 items-center gap-2"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-h-10 flex-1 rounded-xl bg-white/10 px-3 text-sm outline-none focus:bg-white/15"
              />
              <button type="submit" className="min-h-10 rounded-xl bg-white/20 px-3 text-sm">Save</button>
              <button type="button" onClick={() => { setName(item.name); setRenaming(false); }} className="min-h-10 rounded-xl px-3 text-sm">Cancel</button>
            </form>
          ) : (
            <>
              <div className="min-w-[8rem] flex-1">
                <div className="truncate text-sm font-medium">{item.name}</div>
                <div className="truncate text-[11px] text-white/60">
                  {item.kind} · {formatSize(item.size)} · {new Date(item.createdAt).toLocaleDateString()}
                </div>
              </div>
              <button type="button" onClick={() => setRenaming(true)} aria-label="Rename" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10">
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={async () => { await vault.toggleFavorite(item.id); await onChanged(); }}
                aria-label={item.favorite ? "Unfavorite" : "Favorite"}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10"
              >
                <Heart className={cn("h-4 w-4", item.favorite && "fill-[oklch(0.75_0.2_20)] text-[oklch(0.75_0.2_20)]")} />
              </button>
              {url && (
                <a href={url} download={item.originalFilename || item.name} aria-label="Download" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10">
                  <Download className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={() => {
                  void luminaDialog.danger({
                    title: "Delete File?",
                    description: (
                      <>Permanently delete <span className="font-medium text-white">"{item.name}"</span>? This action cannot be undone.</>
                    ),
                    body: (
                      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-white/80">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-white">{item.name}</div>
                          <div className="truncate text-[11px] text-white/55">
                            {formatSize(item.size)} · {new Date(item.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ),
                    confirmLabel: "Delete File",
                    onConfirm: async () => {
                      const loading = luminaDialog.showLoading({
                        title: "Deleting file…",
                        description: item.name,
                      });
                      try {
                        await vault.remove(item.id);
                        await onChanged();
                      } finally {
                        loading.close();
                      }
                      toast.success("File deleted successfully");
                      onClose();
                    },
                  });
                }}
                aria-label="Delete"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-red-300 hover:bg-red-500/20"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------- Note dialog ----------

function NoteDialog({ onSave, onClose }: { onSave: (name: string, text: string) => void | Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <motion.form
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onSubmit={(e) => { e.preventDefault(); onSave(name.trim() || "Untitled note", text); }}
        className="glass w-full max-w-lg rounded-3xl p-5"
      >
        <div className="mb-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">a private note</div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Title"
          className="w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2.5 text-base outline-none dark:border-white/10 dark:bg-white/5"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write freely — this stays with you."
          rows={6}
          className="mt-3 w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/5"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-full px-4 text-sm text-muted-foreground">Cancel</button>
          <button type="submit" className="min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Save</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

// ---------- Voice dialog ----------

function pickAudioMime(): { mime: string; ext: string } {
  const candidates: { mime: string; ext: string }[] = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  const MR = typeof window !== "undefined" ? (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder : undefined;
  if (MR && typeof MR.isTypeSupported === "function") {
    for (const c of candidates) if (MR.isTypeSupported(c.mime)) return c;
  }
  return { mime: "", ext: "webm" };
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function VoiceDialog({ onSave, onClose }: { onSave: (file: File) => void | Promise<void>; onClose: () => void }) {
  const [status, setStatus] = useState<"idle" | "recording" | "review">("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `Voice memo · ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [saving, setSaving] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const extRef = useRef<string>("webm");

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  useEffect(() => () => {
    cleanupStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [cleanupStream, previewUrl]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mime, ext } = pickAudioMime();
      extRef.current = ext;
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setStatus("review");
        cleanupStream();
      };
      rec.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      tickRef.current = window.setInterval(() => setElapsed(Date.now() - startedAtRef.current), 200);
      setStatus("recording");
    } catch (e) {
      console.error(e);
      setError("Microphone access is needed to record.");
    }
  };

  const stop = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const discard = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setStatus("idle");
    setElapsed(0);
  };

  const save = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setSaving(true);
    try {
      const filename = `${(name.trim() || "Voice memo").replace(/[\\/:*?"<>|]+/g, "_")}.${extRef.current}`;
      const file = new File([blob], filename, { type: blob.type || "audio/webm" });
      await onSave(file);
    } catch (e) {
      console.error(e);
      setError("Couldn't save the recording.");
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="glass w-full max-w-md rounded-3xl p-6 text-center"
      >
        <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">a voice, kept close</div>
        <h2 className="mt-1 font-display text-2xl">Voice memo</h2>

        <div className="mt-6 grid place-items-center">
          <div className={cn(
            "grid h-24 w-24 place-items-center rounded-full border transition",
            status === "recording"
              ? "border-red-400/60 bg-red-500/15 text-red-500 animate-pulse"
              : "border-white/60 bg-white/60 text-primary dark:border-white/10 dark:bg-white/5",
          )}>
            <Mic className="h-9 w-9" />
          </div>
          <div className="mt-3 font-mono text-lg tabular-nums">{fmtTime(elapsed)}</div>
        </div>

        {status === "review" && previewUrl && (
          <div className="mt-4">
            <audio src={previewUrl} controls className="w-full" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Title"
              className="mt-3 w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/5"
            />
          </div>
        )}

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {status === "idle" && (
            <>
              <button type="button" onClick={onClose} className="min-h-11 rounded-full px-4 text-sm text-muted-foreground">Cancel</button>
              <button
                type="button"
                onClick={start}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.62_0.18_290)] to-[oklch(0.52_0.2_270)] px-5 text-sm font-medium text-white shadow-lg shadow-[oklch(0.5_0.2_280)]/25"
              >
                <Mic className="h-4 w-4" /> Start recording
              </button>
            </>
          )}
          {status === "recording" && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-500 px-5 text-sm font-medium text-white"
            >
              <Square className="h-4 w-4" /> Stop
            </button>
          )}
          {status === "review" && (
            <>
              <button type="button" onClick={discard} className="min-h-11 rounded-full px-4 text-sm text-muted-foreground">Re-record</button>
              <button type="button" onClick={onClose} className="min-h-11 rounded-full px-4 text-sm text-muted-foreground">Cancel</button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save to vault"}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}



// ---------- PIN prompt / control ----------

// Module-level flag so remounts (StrictMode, route transitions, parent state
// changes) don't re-fire the WebAuthn prompt in the same page visit. Reset
// on full page reload, which is the correct scope.
let bioPromptedThisVisit = false;


function PinPrompt({
  title, subtitle, onSubmit, onBiometric, onCancel, onForgot,
}: {
  title: string;
  subtitle?: string;
  onSubmit: (pin: string) => Promise<boolean>;
  onBiometric?: () => Promise<boolean>;
  onCancel?: () => void;
  onForgot?: () => void | Promise<void>;
}) {
  const [pin, setPinValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [bioAvail, setBioAvail] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!onBiometric || !hasBiometric()) return;
      const ok = await isBiometricSupported();
      if (alive) setBioAvail(ok);
    })();
    return () => { alive = false; };
  }, [onBiometric]);

  // Auto-prompt biometric once per page visit. We use a module-level flag
  // (not a ref) so that React StrictMode double-invocation and any
  // remount from parent state changes / route transitions don't cause a
  // second WebAuthn prompt in the same session.
  useEffect(() => {
    if (bioPromptedThisVisit || !bioAvail || !onBiometric) return;
    bioPromptedThisVisit = true;
    onBiometric().catch(() => { /* ignore, user can still use PIN */ });
  }, [bioAvail, onBiometric]);


  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col items-center justify-center px-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const norm = normalizePin(pin);
          if (!norm.ok) { setErr(norm.error); return; }
          const ok = await onSubmit(norm.pin);
          if (!ok) { setErr("Incorrect PIN"); setPinValue(""); }
        }}
        className="glass w-full max-w-sm rounded-3xl p-6 text-center shadow-[0_20px_60px_-24px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
      >
        <div
          aria-hidden
          className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/20"
        >
          <Lock className="h-6 w-6" />
        </div>

        <h2 className="mt-5 font-display text-2xl leading-tight">{title}</h2>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={10}
          value={pin}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D+/g, "").slice(0, 10);
            setPinValue(digits);
            setErr(null);
          }}
          className="lumina-focus-ring mt-6 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-3.5 text-center text-lg tracking-[0.4em] outline-none focus:border-primary/50 dark:border-white/10 dark:bg-white/5"
          placeholder="••••"
          aria-label="PIN"
          aria-invalid={!!err}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">4–10 digits</p>

        {err && <p className="mt-2 text-xs text-destructive" role="alert">{err}</p>}

        <div className="mt-5 flex flex-col items-stretch gap-2">
          <button
            type="submit"
            className="lumina-focus-ring inline-flex min-h-12 touch-manipulation items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-md transition active:scale-[0.98]"
          >
            Unlock
          </button>
          {bioAvail && onBiometric && (
            <button
              type="button"
              onClick={async () => {
                const ok = await onBiometric();
                if (!ok) setErr("Biometric check failed");
              }}
              className="lumina-focus-ring inline-flex min-h-12 touch-manipulation items-center justify-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-4 text-sm dark:border-white/10 dark:bg-white/5"
            >
              <Fingerprint className="h-4 w-4" /> Use biometrics
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="lumina-focus-ring min-h-11 touch-manipulation rounded-full px-4 text-sm text-muted-foreground"
            >
              Cancel
            </button>
          )}
        </div>
        {onForgot && (
          <button
            type="button"
            onClick={() => onForgot()}
            className="lumina-focus-ring mt-4 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Forgot PIN?
          </button>
        )}
      </form>
    </div>
  );
}



function PinControl({
  hasPin, onSet, onChange, onClear,
}: {
  hasPin: boolean;
  onSet: (pin: string) => Promise<void>;
  onChange: (pin: string) => Promise<void>;
  onClear: () => void;
}) {
  const [prompting, setPrompting] = useState<null | "set" | "change">(null);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioOn, setBioOn] = useState(() => hasBiometric());

  useEffect(() => {
    let alive = true;
    isBiometricSupported().then((v) => { if (alive) setBioSupported(v); });
    return () => { alive = false; };
  }, []);

  const toggleBio = async () => {
    if (bioOn) { disableBiometric(); setBioOn(false); toast("Biometric unlock disabled"); return; }
    try {
      await enableBiometric();
      setBioOn(true);
      toast.success("Biometric unlock enabled");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't enable biometrics");
    }
  };

  return (
    <>
      {hasPin ? (
        <>
          <button
            onClick={() => setPrompting("change")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-white/60 bg-white/60 px-3 text-sm dark:border-white/10 dark:bg-white/5"
          >
            <KeyRound className="h-4 w-4" /> Change PIN
          </button>
          <button
            onClick={async () => {
              const ok = await luminaDialog.warning({
                title: "Remove PIN lock?",
                description: "The vault will still be hidden by the secret gesture, but no longer require a PIN to open.",
                confirmLabel: "Remove PIN",
              });
              if (ok) onClear();
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-white/60 bg-white/60 px-3 text-sm dark:border-white/10 dark:bg-white/5"
          >
            <LockOpen className="h-4 w-4" /> Remove PIN
          </button>
        </>
      ) : (
        <button
          onClick={() => setPrompting("set")}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-white/60 bg-white/60 px-3 text-sm dark:border-white/10 dark:bg-white/5"
        >
          <Lock className="h-4 w-4" /> Set PIN
        </button>
      )}

      {bioSupported && hasPin && (
        <button
          onClick={toggleBio}
          aria-pressed={bioOn}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-white/60 bg-white/60 px-3 text-sm dark:border-white/10 dark:bg-white/5",
            bioOn && "border-primary/50 bg-primary/15 text-primary",
          )}
        >
          <Fingerprint className="h-4 w-4" /> {bioOn ? "Biometric on" : "Enable biometrics"}
        </button>
      )}

      <AnimatePresence>
        {prompting && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
          >
            <PinSetForm
              mode={prompting}
              onSubmit={async (pin) => {
                if (prompting === "change") await onChange(pin);
                else await onSet(pin);
                setPrompting(null);
              }}
              onCancel={() => setPrompting(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


function PinSetForm({
  mode = "set", onSubmit, onCancel,
}: {
  mode?: "set" | "change";
  onSubmit: (pin: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const isChange = mode === "change";
  return (
    <motion.form
      initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (isChange) {
          const ok = await verifyPin(current);
          if (!ok) return setErr("Current PIN is incorrect");
        }
        const norm = normalizePin(a);
        if (!norm.ok) return setErr(norm.error);
        if (norm.pin !== b.trim()) return setErr("PINs don't match");
        await onSubmit(norm.pin);
      }}
      className="glass w-full max-w-sm rounded-3xl p-6 text-center"
    >
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary">
        <Lock className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-display text-2xl">{isChange ? "Change PIN" : "Set a PIN"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {isChange ? "Confirm your current PIN, then choose a new one." : "You'll enter this each time the vault opens."}
      </p>
      {isChange && (
        <input
          autoFocus type="password" inputMode="numeric" enterKeyHint="next" autoComplete="off" pattern="[0-9]*" maxLength={10}
          value={current}
          onChange={(e) => { setCurrent(e.target.value.replace(/\D+/g, "").slice(0, 10)); setErr(null); }}
          placeholder="Current PIN"
          aria-label="Current PIN"
          className="mt-5 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-center text-lg tracking-[0.4em] outline-none dark:border-white/10 dark:bg-white/5"
        />
      )}
      <input
        autoFocus={!isChange} type="password" inputMode="numeric" enterKeyHint="next" autoComplete="off" pattern="[0-9]*" maxLength={10}
        value={a}
        onChange={(e) => { setA(e.target.value.replace(/\D+/g, "").slice(0, 10)); setErr(null); }}
        placeholder="New PIN"
        aria-label="New PIN"
        className="mt-2 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-center text-lg tracking-[0.4em] outline-none dark:border-white/10 dark:bg-white/5"
      />
      <input
        type="password" inputMode="numeric" enterKeyHint="done" autoComplete="off" pattern="[0-9]*" maxLength={10}
        value={b}
        onChange={(e) => { setB(e.target.value.replace(/\D+/g, "").slice(0, 10)); setErr(null); }}
        placeholder="Confirm"
        aria-label="Confirm new PIN"
        className="mt-2 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-center text-lg tracking-[0.4em] outline-none dark:border-white/10 dark:bg-white/5"
      />
      <p className="mt-2 text-[11px] text-muted-foreground">4–10 digits. Leading zeros are kept.</p>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full px-4 text-sm text-muted-foreground">Cancel</button>
        <button type="submit" className="min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
          {isChange ? "Update PIN" : "Save PIN"}
        </button>
      </div>
    </motion.form>
  );
}


// ---------- PIN reset verification ----------
//
// Two-step recovery: after the user confirms intent in the warning dialog,
// this form asks the user's personal security question. The correct answer
// is verified against a SHA-256 hash stored locally (or a built-in default
// when no custom challenge has been set). Prevents accidental one-tap
// wipes of the PIN and keeps the reset behind a private answer.
function PinResetVerify({
  question, onCancel, onConfirm,
}: {
  question: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSubmit = text.trim().length > 0 && !busy;
  return (
    <motion.form
      initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        const ok = await verifyForgotAnswer(text);
        setBusy(false);
        if (ok) { onConfirm(); return; }
        setErr("Incorrect answer");
        setText("");
      }}
      className="glass w-full max-w-sm rounded-3xl p-6 text-center"
    >
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/15 text-destructive">
        <LockOpen className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-display text-2xl break-words">{question}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Answer correctly to reset your PIN. Your vault items are kept.
      </p>
      <input
        autoFocus
        type="text"
        value={text}
        onChange={(e) => { setText(e.target.value); setErr(null); }}
        placeholder="Enter your answer..."
        aria-label={question}
        maxLength={80}
        autoComplete="off"
        spellCheck={false}
        className="mt-5 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-center text-lg outline-none focus:border-destructive/60 dark:border-white/10 dark:bg-white/5"
      />
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full px-4 text-sm text-muted-foreground">Cancel</button>
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "min-h-11 rounded-full px-5 text-sm font-medium",
            canSubmit
              ? "bg-destructive text-destructive-foreground"
              : "bg-muted text-muted-foreground/70 cursor-not-allowed",
          )}
        >
          {busy ? "Checking…" : "Reset PIN"}
        </button>
      </div>
    </motion.form>
  );
}



// ---------- Forgot-PIN security question control ----------
//
// Lives next to PinControl in the vault settings row. Lets the user set a
// custom challenge (question + answer) used by the Forgot-PIN reset flow.
// Recovery is opt-in — there is no built-in question or answer.
//
// The pub-sub below lets the first-time PIN setup flow (`onSet` in the
// toolbar above) programmatically open this dialog. Skipping the prompt
// leaves recovery unconfigured — the "Forgot PIN?" affordance stays
// hidden until the user explicitly clicks "Set recovery question".
const recoverySetupListeners = new Set<() => void>();
function openRecoverySetup() { recoverySetupListeners.forEach((l) => l()); }

function ForgotChallengeControl() {
  const [prompting, setPrompting] = useState<null | "set" | "edit">(null);
  const [hasCustom, setHasCustom] = useState<boolean>(() => hasCustomForgotChallenge());
  const [currentQ, setCurrentQ] = useState<string>(() => getForgotQuestion() ?? "");

  useEffect(() => {
    const open = () => setPrompting(hasCustomForgotChallenge() ? "edit" : "set");
    recoverySetupListeners.add(open);
    return () => { recoverySetupListeners.delete(open); };
  }, []);


  return (
    <>
      <button
        onClick={() => setPrompting(hasCustom ? "edit" : "set")}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-white/60 bg-white/60 px-3 text-sm dark:border-white/10 dark:bg-white/5"
        title={hasCustom ? `Recovery question: ${currentQ}` : "Set a recovery question"}
      >
        <KeyRound className="h-4 w-4" /> {hasCustom ? "Edit recovery question" : "Set recovery question"}
      </button>
      {hasCustom && (
        <button
          onClick={async () => {
            const ok = await luminaDialog.warning({
              title: "Remove your recovery question?",
              description: "Without a recovery question you won't be able to reset your PIN — you'll need to remember it or clear the vault.",
              confirmLabel: "Remove",
            });
            if (!ok) return;
            clearForgotChallenge();
            setHasCustom(false);
            setCurrentQ(getForgotQuestion() ?? "");
            toast("Recovery question removed");
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-white/60 bg-white/60 px-3 text-sm dark:border-white/10 dark:bg-white/5"
        >
          <X className="h-4 w-4" /> Remove
        </button>
      )}

      <AnimatePresence>
        {prompting && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Recovery question"
          >
            <ForgotChallengeForm
              mode={prompting}
              initialQuestion={hasCustom ? currentQ : ""}
              onCancel={() => setPrompting(null)}
              onSubmit={async (q, a) => {
                await setForgotChallenge(q, a);
                setHasCustom(true);
                setCurrentQ(getForgotQuestion() ?? "");
                setPrompting(null);
                toast.success(prompting === "set" ? "Recovery question set" : "Recovery question updated");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


function ForgotChallengeForm({
  mode, initialQuestion, onCancel, onSubmit,
}: {
  mode: "set" | "edit";
  initialQuestion: string;
  onCancel: () => void;
  onSubmit: (question: string, answer: string) => Promise<void>;
}) {
  const [q, setQ] = useState(initialQuestion);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <motion.form
      initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (a.trim() !== b.trim()) return setErr("Answers don't match");
        setBusy(true);
        try {
          await onSubmit(q, a);
        } catch (ex) {
          setErr(ex instanceof Error ? ex.message : "Couldn't save");
        } finally {
          setBusy(false);
        }
      }}
      className="glass w-full max-w-sm rounded-3xl p-6 text-center"
    >
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary">
        <KeyRound className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-display text-2xl">
        {mode === "set" ? "Set a recovery question" : "Edit your recovery question"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Used only if you tap "Forgot PIN". Answers are case-insensitive.
      </p>
      <input
        autoFocus
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setErr(null); }}
        placeholder="Your question"
        aria-label="Recovery question"
        maxLength={120}
        className="mt-5 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-base outline-none focus:border-primary/50 dark:border-white/10 dark:bg-white/5"
      />
      <input
        type="text"
        value={a}
        onChange={(e) => { setA(e.target.value); setErr(null); }}
        placeholder="Answer"
        aria-label="Answer"
        maxLength={80}
        autoComplete="off"
        spellCheck={false}
        className="mt-2 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-base outline-none focus:border-primary/50 dark:border-white/10 dark:bg-white/5"
      />
      <input
        type="text"
        value={b}
        onChange={(e) => { setB(e.target.value); setErr(null); }}
        placeholder="Confirm answer"
        aria-label="Confirm answer"
        maxLength={80}
        autoComplete="off"
        spellCheck={false}
        className="mt-2 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-base outline-none focus:border-primary/50 dark:border-white/10 dark:bg-white/5"
      />
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full px-4 text-sm text-muted-foreground">Cancel</button>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Saving…" : mode === "set" ? "Save question" : "Update question"}
        </button>
      </div>
    </motion.form>
  );
}


// ---------- Empty state ----------


function EmptyState({ onUpload }: { onUpload?: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-0 px-4 py-10 text-center sm:py-16">
      <div className="relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.94_0.05_290)] to-[oklch(0.88_0.09_300)] text-4xl shadow-inner dark:from-white/10 dark:to-white/5">
        <span aria-hidden>🔒</span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-full blur-xl"
          style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 30%, transparent), transparent 70%)" }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-[oklch(0.55_0.18_285)] shadow-md ring-1 ring-white/70 dark:bg-white/10 dark:ring-white/15"
        >
          <Fingerprint className="h-3.5 w-3.5" />
        </span>
      </div>
      <h3 className="mt-5 font-display text-xl leading-snug sm:mt-6 sm:text-3xl">
        This space belongs only to you.
      </h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:mt-3">
        Photos, memories, thoughts — anything you wish to keep private.
      </p>
      {onUpload && (
        <button
          onClick={onUpload}
          className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-[oklch(0.62_0.18_290)] to-[oklch(0.52_0.2_270)] px-6 text-sm font-medium text-white shadow-lg shadow-[oklch(0.5_0.2_280)]/25 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-[0.98]"
        >
          <Upload className="h-4 w-4" /> Upload your first private memory
        </button>
      )}
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
        <Lock className="h-3 w-3" aria-hidden /> Protected with local encryption &amp; PIN
      </div>
    </div>
  );
}

// ---------- Loading gate ----------
//
// Centered, calm "preparing" screen shown during the first vault read. It
// keeps the lock, title, subtitle, spinner, and status text as one visual
// group so phones never show a stretched skeleton with huge dead space.

function PrivateLoadingGate() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Preparing your private space"
      className="flex min-h-[48dvh] w-full flex-col items-center justify-center px-4 py-10 text-center sm:min-h-[40dvh]"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/20"
      >
        <motion.div
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Lock className="h-6 w-6" aria-hidden />
        </motion.div>
      </motion.div>
      <h2 className="mt-4 font-display text-xl leading-tight text-foreground">
        Your vault
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Kept quietly on this device.
      </p>
      <div className="mt-5 flex items-center gap-2 text-[12px] text-muted-foreground">
        <span
          aria-hidden
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
        />
        <span>Preparing your private space…</span>
      </div>
    </div>
  );
}

// ---------- Loading skeleton ----------


function PrivateSkeleton({ view }: { view: "grid" | "list" }) {
  if (view === "list") {
    return (
      <ul className="divide-y divide-white/50 dark:divide-white/10">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 py-3">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-white/60 dark:bg-white/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-2/3 animate-pulse rounded bg-white/60 dark:bg-white/10" />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-white/50 dark:bg-white/5" />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      aria-label="Loading your vault"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="lumina-skeleton aspect-square rounded-2xl border border-white/60 bg-white/40 dark:border-white/10 dark:bg-white/5"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

// ---------- Thumb with blur-up + fade in ----------

function Thumb({ src, alt = "" }: { src: string; alt?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative h-full w-full overflow-hidden">
      {!loaded && (
        <div
          aria-hidden
          className="lumina-skeleton absolute inset-0 bg-white/60 dark:bg-white/10"
        />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn(
          "h-full w-full object-cover transition-[opacity,filter] duration-500 ease-out",
          loaded ? "opacity-100 blur-0" : "opacity-0 blur-md",
        )}
      />
    </div>
  );
}

// ---------- Import from Lumina ----------

type ImportEntry = {
  key: string;
  kind: "note" | "letter" | "journal" | "thought" | "memory";
  title: string;
  preview: string;
  payload: () => Promise<{ name: string; text?: string; file?: File }>;
};

function truncate(s: string, n = 120) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], name, { type: blob.type || "application/octet-stream" });
  } catch { return null; }
}

function ImportDialog({ onDone, onClose }: { onDone: (count: number) => void | Promise<void>; onClose: () => void }) {
  const notes = useLumina((s) => s.notes);
  const letters = useLumina((s) => s.letters);
  const journal = useLumina((s) => s.journal);
  const thoughts = useLumina((s) => s.thoughts);
  const memories = useLumina((s) => s.memories);
  const [tab, setTab] = useState<"note" | "letter" | "journal" | "thought" | "memory">("note");
  const [selected, setSelected] = useState<Record<string, ImportEntry>>({});
  const [busy, setBusy] = useState(false);

  const groups: Record<typeof tab, ImportEntry[]> = useMemo(() => ({
    note: notes.filter((n) => !n.trashed).map((n): ImportEntry => ({
      key: `note:${n.id}`,
      kind: "note",
      title: n.title || "Untitled",
      preview: truncate(stripHtml(n.content || "")),
      payload: async () => ({ name: n.title || "Untitled note", text: stripHtml(n.content || "") }),
    })),
    letter: letters.map((l): ImportEntry => ({
      key: `letter:${l.id}`,
      kind: "letter",
      title: `To ${l.to || "—"}`,
      preview: truncate(stripHtml(l.body || "")),
      payload: async () => ({ name: `Letter to ${l.to || "—"}`, text: stripHtml(l.body || "") }),
    })),
    journal: journal.map((j): ImportEntry => ({
      key: `journal:${j.id}`,
      kind: "journal",
      title: j.date,
      preview: truncate([j.gratitude, j.reflection, j.highlight].filter(Boolean).join(" · ")),
      payload: async () => ({
        name: `Journal — ${j.date}`,
        text: [j.gratitude && `Gratitude: ${j.gratitude}`, j.reflection && `Reflection: ${j.reflection}`, j.highlight && `Highlight: ${j.highlight}`].filter(Boolean).join("\n\n"),
      }),
    })),
    thought: thoughts.map((t): ImportEntry => ({
      key: `thought:${t.id}`,
      kind: "thought",
      title: "Thought",
      preview: truncate(t.text),
      payload: async () => ({ name: "Thought", text: t.text }),
    })),
    memory: memories.map((m): ImportEntry => ({
      key: `memory:${m.id}`,
      kind: "memory",
      title: m.caption || "Memory",
      preview: m.album || "📷 Image memory",
      payload: async () => {
        const baseName = m.originalFilename || (m.caption || "memory") + ".jpg";
        // Prefer the full-resolution blob from the media store; fall
        // back to the legacy base64 payload in `src`.
        if (m.storageKey) {
          const { getBlob } = await import("@/lib/memory-media");
          const blob = await getBlob(m.storageKey);
          if (blob) {
            const file = new File([blob], baseName, { type: m.mimeType || blob.type || "image/jpeg" });
            return { name: m.caption || "Memory", file };
          }
        }
        const src = m.src || "";
        if (src.startsWith("data:") || src.startsWith("blob:") || /^https?:\/\//i.test(src)) {
          const file = await dataUrlToFile(src, baseName);
          if (file) return { name: m.caption || "Memory", file };
        }
        return { name: m.caption || "Memory", text: src };
      },
    })),
  }), [notes, letters, journal, thoughts, memories]);

  const list = groups[tab] ?? [];

  const toggle = (e: ImportEntry) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[e.key]) delete next[e.key];
      else next[e.key] = e;
      return next;
    });
  };

  const selectedCount = Object.keys(selected).length;

  const doImport = async () => {
    setBusy(true);
    const entries = Object.values(selected);
    const total = entries.length;
    let count = 0;
    const loading = luminaDialog.showLoading({
      title: total === 1 ? "Importing to your vault…" : `Importing ${total} items to your vault…`,
      description: "Copying your writing across.",
      progress: 0,
    });
    try {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        loading.update({ description: entry.title, progress: i / total });
        try {
          const p = await entry.payload();
          if (p.file) await vault.addFile(p.file);
          else await vault.addNote(p.name, p.text || "");
          count++;
        } catch (e) { console.error(e); }
      }
      loading.update({ progress: 1 });
    } finally {
      loading.close();
      setBusy(false);
    }
    await onDone(count);
  };

  const tabs: { k: typeof tab; label: string; count: number }[] = [
    { k: "note", label: "Notes", count: groups.note.length },
    { k: "journal", label: "Journal", count: groups.journal.length },
    { k: "memory", label: "Memories", count: groups.memory.length },
    { k: "letter", label: "Letters", count: groups.letter.length },
    { k: "thought", label: "Thoughts", count: groups.thought.length },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="glass flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">bring things in</div>
            <h2 className="mt-1 font-display text-2xl">Import to Private Album</h2>
            <p className="mt-1 text-sm text-muted-foreground">Copy notes, journal entries, memories, letters or thoughts into your private vault. Originals stay where they are.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/60 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={cn(
                "min-h-9 rounded-full border border-white/60 bg-white/60 px-3 text-xs dark:border-white/10 dark:bg-white/5",
                tab === t.k && "border-primary/50 bg-primary/15 text-primary",
              )}
            >
              {t.label} <span className="opacity-60">· {t.count}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-2xl border border-white/60 bg-white/40 dark:border-white/10 dark:bg-white/5">
          {list.length === 0 ? (
            <div className="grid place-items-center py-12 text-sm text-muted-foreground">Nothing to import here yet.</div>
          ) : (
            <ul className="divide-y divide-white/50 dark:divide-white/10">
              {list.map((e) => {
                const on = !!selected[e.key];
                return (
                  <li key={e.key}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-white/40 dark:hover:bg-white/5">
                      <input type="checkbox" checked={on} onChange={() => toggle(e)} className="mt-1 h-4 w-4 accent-[oklch(0.62_0.18_290)]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{e.title}</div>
                        {e.preview && <div className="truncate text-xs text-muted-foreground">{e.preview}</div>}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">{selectedCount} selected</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded-full px-4 text-sm text-muted-foreground">Cancel</button>
            <button
              type="button"
              disabled={selectedCount === 0 || busy}
              onClick={doImport}
              className="min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              {busy ? "Importing…" : `Import${selectedCount ? ` (${selectedCount})` : ""}`}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
