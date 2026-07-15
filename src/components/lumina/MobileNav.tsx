import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  Home, StickyNote, BookHeart, CheckSquare, MoreHorizontal,
  MessageCircleHeart, Mail, Camera, Calendar, Sparkles,
  Star, LayoutDashboard, Settings, Clock, Smile, Search, Pin,
  Gift, Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { FarewellEntry } from "./FarewellEntry";

const primary = [
  { to: "/app/home", label: "Home", icon: Home },
  { to: "/app/notes", label: "Notes", icon: StickyNote },
  { to: "/app/journal", label: "Journal", icon: BookHeart },
  { to: "/app/tasks", label: "Tasks", icon: CheckSquare },
] as const;

const more = [
  { to: "/app/timeline", label: "Timeline", icon: Clock },
  { to: "/app/thoughts", label: "Thoughts", icon: MessageCircleHeart },
  { to: "/app/letters", label: "Letters", icon: Mail },
  { to: "/app/memories", label: "Memories", icon: Camera },
  { to: "/app/capsules", label: "Capsules", icon: Gift },
  { to: "/app/mood", label: "Mood", icon: Smile },
  { to: "/app/calendar", label: "Calendar", icon: Calendar },
  { to: "/app/habits", label: "Habits", icon: Sparkles },
  { to: "/app/achievements", label: "Achievements", icon: Award },
  { to: "/app/scratch", label: "Scratch", icon: Pin },
  { to: "/app/favorites", label: "Favorites", icon: Star },
  { to: "/app/dashboard", label: "Insights", icon: LayoutDashboard },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

// The mobile More sheet reuses the exact desktop Farewell card via
// <FarewellEntry featured reduceMotion onNavigate={…} />. Keeping a single
// component means desktop and mobile stay visually identical by construction.

export function MobileNav({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (to: string) => {
    const matches = [to, ...(to === "/app/dashboard" ? ["/app/insights"] : [])];
    return matches.some((m) => path === m || path.startsWith(m + "/"));
  };
  const moreActive = more.some((m) => isActive(m.to));

  return (
    <>
      {/* Bottom nav — 5 items exactly: Home / Notes / Journal / Tasks / More */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto max-w-[440px] px-3 pb-2 pt-1">
          <div className="glass lumina-elev-3 flex items-center justify-around rounded-3xl px-2 py-2">
            {primary.map((it) => {
              const active = isActive(it.to);
              const Icon = it.icon;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "relative flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-2 text-[10px] font-medium transition",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="mnav-active"
                      className="absolute inset-0 -z-10 rounded-2xl"
                      style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 60%, transparent), color-mix(in oklab, var(--blossom, var(--primary)) 50%, transparent))" }}
                      transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    />
                  )}
                  <motion.span
                    animate={active ? { scale: 1.12, y: -1 } : { scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 22 }}
                    style={active ? { filter: "drop-shadow(0 0 6px color-mix(in oklab, var(--primary) 55%, transparent))" } : undefined}
                  >
                    <Icon className="h-5 w-5" />
                  </motion.span>
                  <span>{it.label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setSheetOpen(true)}
              aria-label="More"
              className={cn(
                "relative flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-2 text-[10px] font-medium transition",
                moreActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </div>
        </div>
      </nav>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="glass max-h-[88dvh] overflow-y-auto rounded-t-[32px] border-none px-5 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-foreground/15" />
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="font-display text-2xl">Sanctuary</SheetTitle>
          </SheetHeader>

          {/* Featured Farewell card — the exact desktop component, reused */}
          <div className="mb-5">
            <FarewellEntry featured reduceMotion onNavigate={() => setSheetOpen(false)} />
          </div>

          <button
            onClick={() => {
              setSheetOpen(false);
              onOpenSearch?.();
            }}
            className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-white/60 bg-white/60 px-4 py-3.5 text-sm text-muted-foreground transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search everything…</span>
          </button>
          <div className="grid grid-cols-3 gap-3">
            {more.map((m) => {
              const Icon = m.icon;
              const active = isActive(m.to);
              return (
                <Link
                  key={m.to}
                  to={m.to}
                  onClick={() => setSheetOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-3xl border border-white/50 bg-white/50 px-2 py-4 text-xs transition duration-200 hover:-translate-y-0.5 hover:bg-white/70 hover:shadow-sm active:translate-y-0 active:scale-[0.97] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                    active && "bg-white/80 shadow-sm dark:bg-white/10",
                  )}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl text-foreground shadow-sm transition group-hover:scale-105" style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 45%, transparent), color-mix(in oklab, var(--blossom, var(--primary)) 40%, transparent))" }}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-medium">{m.label}</span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
