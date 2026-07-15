import { useEffect, useState } from "react";

/**
 * The Lumina hello — replaces the blank first-line for empty notes.
 * Fades to 40% after the first character, hidden after two.
 */
export function EmptyState({ charCount }: { charCount: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting =
    hour < 5 ? "Quiet hours" :
    hour < 12 ? "Good morning" :
    hour < 17 ? "Good afternoon" :
    hour < 22 ? "Good evening" :
    "Late night";

  const date = now.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });

  const opacity = charCount === 0 ? 1 : charCount === 1 ? 0.4 : 0;

  return (
    <div
      className="lumina-empty"
      style={{ opacity }}
      aria-hidden={charCount > 0}
      aria-live="polite"
      role="status"
    >
      <div className="lumina-empty-rule" />
      <div className="lumina-empty-greeting">{greeting}</div>
      <div className="lumina-empty-date">{date}</div>
      <div className="lumina-empty-rule" />
      <div className="lumina-empty-tag">This page is yours.</div>
      <div className="lumina-empty-rule" />
    </div>
  );
}
