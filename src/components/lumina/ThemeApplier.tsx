import { useEffect, useState } from "react";
import { useLumina } from "@/lib/lumina-store";

function timeOfDay(h: number): "morning" | "afternoon" | "evening" | "night" {
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

const KNOWN_THEMES = new Set([
  "sakura", "lavender", "midnight", "ocean", "arctic", "rain", "galaxy", "sapphire", "coffee", "peach",
]);

export function ThemeApplier() {
  const theme = useLumina((s) => s.theme);
  const setTheme = useLumina((s) => s.setTheme);
  const dark = useLumina((s) => s.dark);
  const density = useLumina((s) => s.density);
  const fontScale = useLumina((s) => s.fontScale);
  const [tod, setTod] = useState(() => timeOfDay(new Date().getHours()));
  useEffect(() => {
    if (!KNOWN_THEMES.has(theme)) setTheme("midnight");
  }, [theme, setTheme]);
  useEffect(() => {
    const t = setInterval(() => setTod(timeOfDay(new Date().getHours())), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);
    html.setAttribute("data-density", density);
    html.setAttribute("data-font-scale", fontScale);
    html.setAttribute("data-timeofday", tod);
    html.classList.toggle("dark", dark);
  }, [theme, dark, density, fontScale, tod]);
  return null;
}