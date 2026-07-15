import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Home, StickyNote, BookHeart, MessageCircleHeart, Mail, Camera,
  Calendar, CheckSquare, Sparkles, Star, LayoutDashboard,
  Settings, PanelLeftClose, PanelLeftOpen, Flower2, Search, Smile,
  Gift, Award, Clock, Pin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLumina } from "@/lib/lumina-store";
import { UserChip } from "@/components/lumina/UserChip";
import { SyncPill } from "@/components/lumina/SyncPill";
import { FarewellEntry } from "@/components/lumina/FarewellEntry";

const items = [
  { to: "/app/home", label: "Home", icon: Home },
  { to: "/app/notes", label: "Notes", icon: StickyNote },
  { to: "/app/journal", label: "Journal", icon: BookHeart },
  { to: "/app/thoughts", label: "Thoughts", icon: MessageCircleHeart },
  { to: "/app/letters", label: "Letters", icon: Mail },
  { to: "/app/memories", label: "Memories", icon: Camera },
  { to: "/app/capsules", label: "Memory Capsules", icon: Gift },
  { to: "/app/calendar", label: "Calendar", icon: Calendar },
  { to: "/app/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/app/habits", label: "Habits", icon: Sparkles },
  { to: "/app/timeline", label: "Timeline", icon: Clock },
  { to: "/app/favorites", label: "Favorites", icon: Star },
  { to: "/app/dashboard", label: "Insights", icon: LayoutDashboard },
  { to: "/app/achievements", label: "Achievements", icon: Award },
  { to: "/app/mood", label: "Mood", icon: Smile },
  { to: "/app/scratch", label: "Scratch", icon: Pin },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const collapsed = useLumina((s) => s.sidebarCollapsed);
  const setCollapsed = useLumina((s) => s.setSidebarCollapsed);
  const open = !collapsed;
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <motion.aside
      animate={{ width: open ? 248 : 78 }}
      transition={{ type: "spring", stiffness: 180, damping: 22 }}
      className="glass z-20 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col overflow-hidden rounded-3xl p-4 md:flex"
    >


      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white shadow-md" style={{ background: "linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--blossom, var(--primary)) 80%, transparent))" }}>
          <Flower2 className="h-5 w-5" />
        </div>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="min-w-0"
          >
            <div className="font-display text-xl leading-none text-gradient">Lumina</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">sanctuary</div>
          </motion.div>
        )}
      </div>
      <button
        onClick={onOpenSearch}
        className={cn(
          "mb-3 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-xs text-muted-foreground transition hover:bg-white/70 dark:border-white/10 dark:bg-white/5",
          !open && "justify-center px-2",
        )}
        aria-label="Search Lumina (⌘K)"
      >
        <Search className="h-4 w-4 shrink-0" />
        {open && (
          <>
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded-md border border-white/60 bg-white/60 px-1.5 py-0.5 text-[10px] uppercase tracking-widest dark:border-white/10 dark:bg-white/5">⌘K</kbd>
          </>
        )}
      </button>
      <nav className="lumina-scroll min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-1.5">
        {items.map((it) => {
          const matches = [it.to, ...(it.to === "/app/dashboard" ? ["/app/insights"] : [])];
          const active = matches.some((m) => path === m || path.startsWith(m + "/"));
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
                active
                  ? "bg-white/70 text-foreground shadow-sm dark:bg-white/10"
                  : "text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-white/5",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 -z-10 rounded-2xl"
                  style={{ background: "linear-gradient(90deg, color-mix(in oklab, var(--primary) 55%, transparent), color-mix(in oklab, var(--blossom, var(--primary)) 45%, transparent))" }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {open && <span className="truncate">{it.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 shrink-0 space-y-3 border-t border-white/50 pt-4 dark:border-white/10">
        <FarewellEntry collapsed={!open} />
        <div className={cn("flex pt-1", open ? "justify-start" : "justify-center")}>
          <SyncPill compact={!open} />
        </div>
        <UserChip collapsed={!open} />
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-xs text-muted-foreground transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 dark:border-white/10 dark:bg-white/5"
        >
          {open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          {open && <span>Collapse</span>}
        </button>
      </div>

    </motion.aside>
  );
}