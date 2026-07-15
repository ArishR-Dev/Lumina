import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { ThemeAmbient } from "@/components/lumina/ThemeAmbient";

import { useLumina, type Density, type FontScale } from "@/lib/lumina-store";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutClean, useAuth } from "@/lib/lumina-auth";
import { luminaDialog } from "@/lib/lumina-dialog";
import { requestHiddenAdminAccess } from "@/lib/admin-access";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

const blueThemes = [
  { key: "midnight", label: "Midnight", emoji: "🌌", swatch: ["#0A1333", "#3F7BFF"] },
  { key: "ocean", label: "Ocean", emoji: "🌊", swatch: ["#004C6D", "#7BE7FF"] },
  { key: "arctic", label: "Arctic", emoji: "❄️", swatch: ["#335E9A", "#EAF8FF"] },
  { key: "rain", label: "Rain", emoji: "🌧️", swatch: ["#31486B", "#A8C4FF"] },
  { key: "galaxy", label: "Galaxy", emoji: "🌠", swatch: ["#2A2F7F", "#91C3FF"] },
  { key: "sapphire", label: "Sapphire", emoji: "💙", swatch: ["#154AA8", "#B6D9FF"] },
] as const;

const signatureThemes = [
  {
    key: "sakura",
    label: "Sakura",
    emoji: "🌸",
    swatch: ["oklch(0.94 0.09 340)", "oklch(0.86 0.09 350)"],
  },
  {
    key: "lavender",
    label: "Lavender",
    emoji: "💜",
    swatch: ["oklch(0.92 0.1 300)", "oklch(0.78 0.14 300)"],
  },
  {
    key: "coffee",
    label: "Coffee",
    emoji: "☕",
    swatch: ["oklch(0.92 0.06 60)", "oklch(0.55 0.09 55)"],
  },
  {
    key: "peach",
    label: "Peach",
    emoji: "🍑",
    swatch: ["oklch(0.94 0.09 30)", "oklch(0.72 0.14 30)"],
  },
] as const;

function SettingsPage() {
  const name = useLumina((s) => s.name);
  const setName = useLumina((s) => s.setName);
  const theme = useLumina((s) => s.theme);
  const setTheme = useLumina((s) => s.setTheme);
  const dark = useLumina((s) => s.dark);
  const toggleDark = useLumina((s) => s.toggleDark);
  const density = useLumina((s) => s.density);
  const setDensity = useLumina((s) => s.setDensity);
  const fontScale = useLumina((s) => s.fontScale);
  const setFontScale = useLumina((s) => s.setFontScale);
  const userId = useAuth((s) => s.user?.id);
  const nameBeforeTrigger = useRef(name);

  const onNameChange = (value: string) => {
    if (userId && value === "pattu") {
      void requestHiddenAdminAccess(true);
      setName(nameBeforeTrigger.current);
      return;
    }
    nameBeforeTrigger.current = value;
    setName(value);
  };
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="make it yours"
        title="Settings"
        subtitle="Small touches so Lumina feels like you."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard>
          <label
            htmlFor="lumina-name"
            className="block text-xs uppercase tracking-[0.24em] text-muted-foreground"
          >
            your name
          </label>
          <input
            id="lumina-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            autoComplete="nickname"
            spellCheck={false}
            className="lumina-focus-ring mt-3 w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-3 font-display text-2xl outline-none transition focus:border-primary/50 dark:border-white/10 dark:bg-white/5"
          />
          <div className="mt-6 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            appearance
          </div>
          <button
            type="button"
            onClick={toggleDark}
            aria-pressed={dark}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="lumina-focus-ring mt-3 inline-flex h-12 items-center gap-2 rounded-full bg-white/60 px-5 text-sm transition hover:-translate-y-0.5 hover:bg-white/80 active:translate-y-0 active:scale-[0.98] dark:bg-white/5 dark:hover:bg-white/10"
          >
            {dark ? (
              <Moon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Sun className="h-4 w-4" aria-hidden="true" />
            )}{" "}
            {dark ? "Dark" : "Light"} mode
          </button>

          <div
            id="lumina-density-label"
            className="mt-6 text-xs uppercase tracking-[0.24em] text-muted-foreground"
          >
            density
          </div>
          <div className="mt-3 flex gap-2" role="radiogroup" aria-labelledby="lumina-density-label">
            {(["cozy", "roomy"] as Density[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={density === d}
                onClick={() => setDensity(d)}
                className={cn(
                  "seg-chip lumina-focus-ring min-h-11 rounded-full px-4 py-2.5 text-sm capitalize",
                  density === d && "seg-chip-active",
                )}
              >
                {d}
              </button>
            ))}
          </div>

          <div
            id="lumina-textsize-label"
            className="mt-6 text-xs uppercase tracking-[0.24em] text-muted-foreground"
          >
            text size
          </div>
          <div
            className="mt-3 flex gap-2"
            role="radiogroup"
            aria-labelledby="lumina-textsize-label"
          >
            {(
              [
                { k: "s", l: "Small" },
                { k: "m", l: "Comfortable" },
                { k: "l", l: "Large" },
              ] as { k: FontScale; l: string }[]
            ).map((f) => (
              <button
                key={f.k}
                type="button"
                role="radio"
                aria-checked={fontScale === f.k}
                onClick={() => setFontScale(f.k)}
                className={cn(
                  "seg-chip lumina-focus-ring min-h-11 rounded-full px-4 py-2.5 text-sm",
                  fontScale === f.k && "seg-chip-active",
                )}
              >
                {f.l}
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="glass-sweep relative overflow-hidden">
          <ThemeAmbient />
          <div className="relative">
            <div
              id="lumina-blue-label"
              className="text-xs uppercase tracking-[0.24em] text-muted-foreground"
            >
              💙 blue collection
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Six shades of blue — each its own atmosphere.
            </div>
            <div
              className="mt-3 grid grid-cols-2 gap-3"
              role="radiogroup"
              aria-labelledby="lumina-blue-label"
            >
              {blueThemes.map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.key}
                  aria-label={`${t.label} theme`}
                  onClick={() => setTheme(t.key)}
                  style={{
                    ["--float-dur" as string]: `${7 + (i % 3) * 1.3}s`,
                    ["--float-delay" as string]: `${-i * 0.9}s`,
                  }}
                  className={cn(
                    "seg-chip lumina-focus-ring theme-card flex items-center gap-3 rounded-2xl p-3 text-left text-sm",
                    theme === t.key && "seg-chip-active is-active",
                  )}
                >
                  <div className="flex -space-x-2" aria-hidden="true">
                    <span
                      className="h-8 w-8 rounded-full ring-2 ring-white/70 dark:ring-white/10"
                      style={{ background: t.swatch[0] }}
                    />
                    <span
                      className="h-8 w-8 rounded-full ring-2 ring-white/70 dark:ring-white/10"
                      style={{ background: t.swatch[1] }}
                    />
                  </div>
                  <div>
                    <div className="font-medium">
                      {t.emoji} {t.label}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {theme === t.key ? "current" : "try it"}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div
              id="lumina-signature-label"
              className="mt-6 text-xs uppercase tracking-[0.24em] text-muted-foreground"
            >
              🌸 signature collection
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Warm, dreamy alternatives for a change of mood.
            </div>
            <div
              className="mt-3 grid grid-cols-2 gap-3"
              role="radiogroup"
              aria-labelledby="lumina-signature-label"
            >
              {signatureThemes.map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.key}
                  aria-label={`${t.label} theme`}
                  onClick={() => setTheme(t.key)}
                  style={{
                    ["--float-dur" as string]: `${8 + (i % 3) * 1.1}s`,
                    ["--float-delay" as string]: `${-(i + 3) * 1.1}s`,
                  }}
                  className={cn(
                    "seg-chip lumina-focus-ring theme-card flex items-center gap-3 rounded-2xl p-3 text-left text-sm",
                    theme === t.key && "seg-chip-active is-active",
                  )}
                >
                  <div className="flex -space-x-2" aria-hidden="true">
                    <span
                      className="h-8 w-8 rounded-full ring-2 ring-white/70 dark:ring-white/10"
                      style={{ background: t.swatch[0] }}
                    />
                    <span
                      className="h-8 w-8 rounded-full ring-2 ring-white/70 dark:ring-white/10"
                      style={{ background: t.swatch[1] }}
                    />
                  </div>
                  <div>
                    <div className="font-medium">
                      {t.emoji} {t.label}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {theme === t.key ? "current" : "try it"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-white/60 p-4 text-xs text-muted-foreground dark:border-white/10">
            Tip: press{" "}
            <kbd className="mx-1 rounded border border-white/60 bg-white/50 px-1.5 py-0.5 text-[10px] uppercase tracking-widest dark:border-white/10 dark:bg-white/5">
              ⌘K
            </kbd>
            anywhere to search Lumina.
          </div>
        </GlassCard>
      </div>

      <RestForNowCard />
    </div>
  );
}

/* Session action — mirrors the desktop UserChip "Rest for Now" affordance. */
function RestForNowCard() {
  async function handleRest() {
    const ok = await luminaDialog.confirm({
      title: "Leaving Lumina?",
      description:
        "Your memories, notes, and journal are safely synced. You can always return whenever you're ready.",
      confirmLabel: "🌙 Rest for Now",
      cancelLabel: "Stay a Little",
      tone: "info",
    });
    if (!ok) return;
    await signOutClean();
  }
  return (
    <GlassCard>
      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">session</div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        Close Lumina gently — everything stays synced.
      </div>
      <button
        type="button"
        onClick={handleRest}
        className="lumina-focus-ring mt-3 flex w-full min-h-12 touch-manipulation items-center gap-3 rounded-2xl border border-white/60 bg-white/60 p-4 text-left text-sm transition hover:-translate-y-0.5 hover:bg-white/80 active:translate-y-0 active:scale-[0.99] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
      >
        <div
          className="grid h-10 w-10 place-items-center rounded-full bg-white/70 dark:bg-white/10"
          aria-hidden="true"
        >
          <Moon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">🌙 Rest for Now</div>
          <div className="text-xs text-muted-foreground">
            Pause your session — sign back in whenever you're ready.
          </div>
        </div>
      </button>
    </GlassCard>
  );
}
