import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Printer, Type as TypeIcon, Palette, Minus, Plus } from "lucide-react";
import { wordsFromHtml } from "@/lib/lumina-timeline";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize-html";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string; // HTML
  meta?: string;
};

type FontKey = "serif" | "sans" | "mono";
type ThemeKey = "paper" | "sepia" | "cream" | "night";

const FONTS: Record<FontKey, string> = {
  serif: "font-serif",
  sans: "font-sans",
  mono: "font-mono",
};

const THEMES: Record<ThemeKey, { bg: string; fg: string; label: string; swatch: string }> = {
  paper:  { label: "Paper",  bg: "bg-[oklch(0.985_0.01_90)] text-[oklch(0.22_0.02_280)]", fg: "", swatch: "oklch(0.98 0.01 90)" },
  sepia:  { label: "Sepia",  bg: "bg-[oklch(0.94_0.04_75)] text-[oklch(0.28_0.04_50)]", fg: "", swatch: "oklch(0.94 0.04 75)" },
  cream:  { label: "Cream",  bg: "bg-[oklch(0.96_0.03_30)] text-[oklch(0.26_0.03_30)]", fg: "", swatch: "oklch(0.96 0.03 30)" },
  night:  { label: "Night",  bg: "bg-[oklch(0.18_0.02_280)] text-[oklch(0.92_0.02_280)]", fg: "", swatch: "oklch(0.18 0.02 280)" },
};

export function ReadingMode({ open, onClose, title, content, meta }: Props) {
  const [font, setFont] = useState<FontKey>(() => (localStorage.getItem("lumina-read-font") as FontKey) || "serif");
  const [theme, setTheme] = useState<ThemeKey>(() => (localStorage.getItem("lumina-read-theme") as ThemeKey) || "paper");
  const [size, setSize] = useState<number>(() => Number(localStorage.getItem("lumina-read-size")) || 18);
  const [progress, setProgress] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { localStorage.setItem("lumina-read-font", font); }, [font]);
  useEffect(() => { localStorage.setItem("lumina-read-theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("lumina-read-size", String(size)); }, [size]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!open || !el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? el.scrollTop / max : 0);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open, content]);

  const words = useMemo(() => wordsFromHtml(content), [content]);
  const minutes = Math.max(1, Math.ceil(words / 220));

  const handlePrint = () => {
    document.documentElement.classList.add("lumina-print-mode");
    const cleanup = () => document.documentElement.classList.remove("lumina-print-mode");
    window.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(() => window.print(), 50);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn("fixed inset-0 z-[70] transition-colors duration-500", THEMES[theme].bg)}
          data-lumina-reader
        >
          {/* Progress bar */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-20 h-1 bg-transparent print:hidden">
            <div
              className="h-full origin-left bg-gradient-to-r from-primary via-[color-mix(in_oklab,var(--primary)_50%,var(--accent))] to-accent"
              style={{ transform: `scaleX(${progress})`, transition: "transform 120ms linear" }}
            />
          </div>

          {/* Toolbar */}
          <div className="fixed right-4 top-4 z-30 flex items-center gap-1.5 rounded-full border border-current/10 bg-white/60 p-1.5 shadow-lg backdrop-blur-md dark:bg-black/40 print:hidden">
            <FontSelect value={font} onChange={setFont} />
            <div className="mx-0.5 h-5 w-px bg-current/10" />
            <ThemeSelect value={theme} onChange={setTheme} />
            <div className="mx-0.5 h-5 w-px bg-current/10" />
            <button
              aria-label="Decrease text size"
              onClick={() => setSize((s) => Math.max(14, s - 1))}
              className="grid h-8 w-8 place-items-center rounded-full hover:bg-current/10"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-6 text-center text-xs tabular-nums opacity-70">{size}</span>
            <button
              aria-label="Increase text size"
              onClick={() => setSize((s) => Math.min(26, s + 1))}
              className="grid h-8 w-8 place-items-center rounded-full hover:bg-current/10"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <div className="mx-0.5 h-5 w-px bg-current/10" />
            <button
              aria-label="Print"
              onClick={handlePrint}
              className="grid h-8 w-8 place-items-center rounded-full hover:bg-current/10"
            >
              <Printer className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close reading mode"
              className="grid h-8 w-8 place-items-center rounded-full hover:bg-current/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scroller */}
          <div ref={scrollerRef} className="lumina-scroll h-full overflow-y-auto overflow-x-hidden" data-scroll-root>
            <motion.article
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 10, opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "mx-auto max-w-2xl px-6 pb-32 pt-20 sm:px-10 lumina-reader-article",
                FONTS[font],
              )}
              style={{ fontSize: `${size}px`, lineHeight: 1.85 }}
            >
              <div className="text-[11px] uppercase tracking-[0.28em] opacity-70">
                {meta ?? "Reading"} · {minutes} min · {words} words
              </div>
              <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">{title || "Untitled"}</h1>
              <div className="mt-6 h-px w-16 bg-current/40" />
              <div
                className="prose prose-lg mt-8 max-w-none leading-[1.85] prose-headings:font-display prose-p:my-5 prose-a:text-primary"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) || "<p class='opacity-60'>Nothing to read yet.</p>" }}
              />
            </motion.article>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FontSelect({ value, onChange }: { value: FontKey; onChange: (v: FontKey) => void }) {
  const options: FontKey[] = ["serif", "sans", "mono"];
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Font">
      <TypeIcon className="mx-1 h-3.5 w-3.5 opacity-60" />
      {options.map((o) => (
        <button
          key={o}
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-full px-2 py-1 text-[11px] uppercase tracking-widest transition",
            value === o ? "bg-current/15 font-semibold" : "opacity-60 hover:opacity-100",
          )}
        >
          {o[0]}
        </button>
      ))}
    </div>
  );
}

function ThemeSelect({ value, onChange }: { value: ThemeKey; onChange: (v: ThemeKey) => void }) {
  const keys: ThemeKey[] = ["paper", "sepia", "cream", "night"];
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Reading theme">
      <Palette className="mx-1 h-3.5 w-3.5 opacity-60" />
      {keys.map((k) => (
        <button
          key={k}
          role="radio"
          aria-checked={value === k}
          aria-label={THEMES[k].label}
          onClick={() => onChange(k)}
          className={cn(
            "h-5 w-5 rounded-full border transition",
            value === k ? "ring-2 ring-offset-1 ring-current scale-110" : "opacity-70 hover:opacity-100",
          )}
          style={{ background: THEMES[k].swatch, borderColor: "rgba(0,0,0,0.15)" }}
        />
      ))}
    </div>
  );
}
