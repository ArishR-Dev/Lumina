import { Command } from "cmdk";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  Search, Sparkles, StickyNote, BookHeart, MessageCircleHeart, Mail,
  Camera, CheckSquare, Clock, Gift, PenLine, Moon, Sun, Star, Award,
  LayoutDashboard, Settings, Home, Smile, Calendar, ArrowRight,
} from "lucide-react";
import { useLumina } from "@/lib/lumina-store";
import { useShallow } from "zustand/react/shallow";
import { stripHtml } from "@/lib/lumina-timeline";

type HitType =
  | "note" | "journal" | "thought" | "letter" | "memory" | "task" | "capsule";
type Hit = {
  id: string;
  type: HitType;
  title: string;
  preview: string;
  href: string;
  entityId?: string;
};

type PaletteCommand = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
};

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { notes, journal, thoughts, letters, memories, tasks, capsules, recentSearches, dark } = useLumina(
    useShallow((s) => ({
      notes: s.notes,
      journal: s.journal,
      thoughts: s.thoughts,
      letters: s.letters,
      memories: s.memories,
      tasks: s.tasks,
      capsules: s.capsules,
      recentSearches: s.recentSearches,
      dark: s.dark,
    })),
  );
  const addRecentSearch = useLumina((s) => s.addRecentSearch);
  const toggleDark = useLumina((s) => s.toggleDark);
  const addNote = useLumina((s) => s.addNote);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const goTo = (href: string) => {
    onOpenChange(false);
    navigate({ to: href });
  };
  const goToDetail = (kind: HitType, id: string) => {
    onOpenChange(false);
    const routeMap: Record<HitType, string> = {
      note: "/app/notes/$id",
      journal: "/app/journal/$id",
      thought: "/app/thoughts/$id",
      letter: "/app/letters/$id",
      memory: "/app/memories/$id",
      task: "/app/tasks/$id",
      capsule: "/app/capsules/$id",
    };
    navigate({ to: routeMap[kind], params: { id } as never });
  };

  const commands: PaletteCommand[] = useMemo(() => [
    { id: "cmd-home", label: "Go to Home", icon: <Home className="h-4 w-4" />, run: () => goTo("/app/home") },
    { id: "cmd-notes", label: "Go to Notes", icon: <StickyNote className="h-4 w-4" />, run: () => goTo("/app/notes") },
    { id: "cmd-journal", label: "Go to Journal", icon: <BookHeart className="h-4 w-4" />, run: () => goTo("/app/journal") },
    { id: "cmd-letters", label: "Go to Letters", icon: <Mail className="h-4 w-4" />, run: () => goTo("/app/letters") },
    { id: "cmd-memories", label: "Go to Memories", icon: <Camera className="h-4 w-4" />, run: () => goTo("/app/memories") },
    { id: "cmd-thoughts", label: "Go to Thoughts", icon: <MessageCircleHeart className="h-4 w-4" />, run: () => goTo("/app/thoughts") },
    { id: "cmd-tasks", label: "Go to Tasks", icon: <CheckSquare className="h-4 w-4" />, run: () => goTo("/app/tasks") },
    { id: "cmd-capsules", label: "Go to Memory Capsules", icon: <Gift className="h-4 w-4" />, run: () => goTo("/app/capsules") },
    { id: "cmd-calendar", label: "Go to Calendar", icon: <Calendar className="h-4 w-4" />, run: () => goTo("/app/calendar") },
    { id: "cmd-mood", label: "Go to Mood", icon: <Smile className="h-4 w-4" />, run: () => goTo("/app/mood") },
    { id: "cmd-timeline", label: "Go to Timeline", icon: <Clock className="h-4 w-4" />, run: () => goTo("/app/timeline") },
    { id: "cmd-favorites", label: "Go to Favorites", icon: <Star className="h-4 w-4" />, run: () => goTo("/app/favorites") },
    { id: "cmd-insights", label: "Go to Insights", icon: <LayoutDashboard className="h-4 w-4" />, run: () => goTo("/app/dashboard") },
    { id: "cmd-achievements", label: "Go to Achievements", icon: <Award className="h-4 w-4" />, run: () => goTo("/app/achievements") },
    { id: "cmd-settings", label: "Go to Settings", icon: <Settings className="h-4 w-4" />, run: () => goTo("/app/settings") },
    {
      id: "cmd-new-note",
      label: "New note",
      hint: "Create and open",
      icon: <PenLine className="h-4 w-4" />,
      run: () => {
        const n = addNote({ title: "Untitled" });
        onOpenChange(false);
        navigate({ to: "/app/notes/$id", params: { id: n.id } });
      },
    },
    {
      id: "cmd-toggle-dark",
      label: dark ? "Switch to light mode" : "Switch to dark mode",
      icon: dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
      run: () => { toggleDark(); },
    },
  ], [dark, toggleDark, addNote, navigate, onOpenChange]);

  const filteredCommands = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands.slice(0, 6);
    return commands.filter((c) => c.label.toLowerCase().includes(s)).slice(0, 8);
  }, [q, commands]);

  const hits: Hit[] = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all: Hit[] = [
      ...notes.filter((n) => !n.trashed).map((n): Hit => ({
        id: "n" + n.id, type: "note", title: n.title || "Untitled",
        preview: stripHtml(n.content).slice(0, 120),
        href: `/app/notes/${n.id}`, entityId: n.id,
      })),
      ...journal.map((j): Hit => ({
        id: "j" + j.id, type: "journal",
        title: `Journal · ${new Date(j.date).toLocaleDateString()}`,
        preview: (j.gratitude || j.reflection || j.highlight || "").slice(0, 120),
        href: `/app/journal/${j.id}`, entityId: j.id,
      })),
      ...thoughts.map((t): Hit => ({
        id: "t" + t.id, type: "thought", title: "Thought",
        preview: t.text.slice(0, 120),
        href: `/app/thoughts/${t.id}`, entityId: t.id,
      })),
      ...letters.map((l): Hit => ({
        id: "l" + l.id, type: "letter", title: `To ${l.to || "someone"}`,
        preview: l.body.slice(0, 120),
        href: `/app/letters/${l.id}`, entityId: l.id,
      })),
      ...memories.map((m): Hit => ({
        id: "m" + m.id, type: "memory", title: m.caption || "Memory",
        preview: [m.album, m.originalFilename].filter(Boolean).join(" · "),
        href: `/app/memories/${m.id}`, entityId: m.id,
      })),

      ...tasks.map((t): Hit => ({
        id: "k" + t.id, type: "task", title: t.text,
        preview: t.done ? "done" : "todo",
        href: `/app/tasks/${t.id}`, entityId: t.id,
      })),
      ...capsules.map((c): Hit => ({
        id: "c" + c.id, type: "capsule",
        title: c.title || "A capsule",
        preview: (c.opened ? "opened · " : "sealed · ") + c.message.slice(0, 110),
        href: `/app/capsules/${c.id}`, entityId: c.id,
      })),
    ];
    if (!s) return all.slice(0, 20);
    return all
      .filter((h) => (h.title + " " + h.preview).toLowerCase().includes(s))
      .slice(0, 40);
  }, [q, notes, journal, thoughts, letters, memories, tasks, capsules]);

  const openHit = (h: Hit) => {
    if (q.trim()) addRecentSearch(q.trim());
    if (h.entityId) {
      goToDetail(h.type, h.entityId);
    } else {
      onOpenChange(false);
      navigate({ to: h.href });
    }
  };

  const iconFor = (t: HitType) => {
    const map: Record<HitType, React.ReactNode> = {
      note: <StickyNote className="h-4 w-4" />,
      journal: <BookHeart className="h-4 w-4" />,
      thought: <MessageCircleHeart className="h-4 w-4" />,
      letter: <Mail className="h-4 w-4" />,
      memory: <Camera className="h-4 w-4" />,
      task: <CheckSquare className="h-4 w-4" />,
      capsule: <Gift className="h-4 w-4" />,
    };
    return map[t];
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] grid place-items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Search Lumina"
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="glass w-full max-w-2xl overflow-hidden rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Command shouldFilter={false} label="Global search">
              <div className="flex items-center gap-3 border-b border-white/40 px-5 py-4 dark:border-white/10">
                <Search className="h-5 w-5 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  value={q}
                  onValueChange={setQ}
                  placeholder="Search notes, journals, letters…"
                  inputMode="search"
                  enterKeyHint="search"
                  aria-label="Search Lumina"
                  className="w-full border-none bg-transparent text-lg outline-none placeholder:text-muted-foreground/70"
                />
                <kbd className="hidden rounded-md border border-white/60 bg-white/50 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground sm:inline-block dark:border-white/10 dark:bg-white/5">esc</kbd>
              </div>
              <Command.List className="lumina-scroll max-h-[52vh] overflow-y-auto overflow-x-hidden p-2">
                {!q && recentSearches.length > 0 && (
                  <Command.Group heading="Recent" className="px-2 pb-2 pt-1 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    {recentSearches.map((r) => (
                      <Command.Item key={r} value={"recent-" + r} onSelect={() => setQ(r)}
                        className="mt-1 flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-sm data-[selected=true]:bg-white/60 dark:data-[selected=true]:bg-white/10">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{r}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                <Command.Empty className="grid place-items-center gap-2 p-10 text-center text-sm text-muted-foreground">
                  <Sparkles className="h-6 w-6 text-primary/70" />
                  Nothing matches — try different words.
                </Command.Empty>

                {filteredCommands.length > 0 && (
                  <Command.Group heading="Commands" className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    {filteredCommands.map((c) => (
                      <Command.Item
                        key={c.id}
                        value={"cmd " + c.label}
                        onSelect={() => { if (q.trim()) addRecentSearch(q.trim()); c.run(); }}
                        className="mt-1 flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-sm data-[selected=true]:bg-white/60 dark:data-[selected=true]:bg-white/10"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/60 text-primary dark:bg-white/10">
                          {c.icon}
                        </span>
                        <span className="flex-1 truncate text-foreground">{c.label}</span>
                        {c.hint && (
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.hint}</span>
                        )}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {hits.length > 0 && (
                  <Command.Group heading="In your Lumina" className="px-2 pb-1 pt-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    {hits.map((h) => (
                      <Command.Item
                        key={h.id}
                        value={h.id + " " + h.title + " " + h.preview}
                        onSelect={() => openHit(h)}
                        className="mt-1 flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-2.5 data-[selected=true]:bg-white/60 dark:data-[selected=true]:bg-white/10"
                      >
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/60 text-primary dark:bg-white/10">
                          {iconFor(h.type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{highlight(h.title, q)}</span>
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{h.type}</span>
                          </div>
                          {h.preview && (
                            <div className="truncate text-xs text-muted-foreground">{highlight(h.preview, q)}</div>
                          )}
                        </div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
              <div className="flex items-center justify-between border-t border-white/40 px-5 py-2.5 text-[10px] uppercase tracking-[0.24em] text-muted-foreground dark:border-white/10">
                <span>Lumina search</span>
                <span>↵ open · ↑↓ navigate</span>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}