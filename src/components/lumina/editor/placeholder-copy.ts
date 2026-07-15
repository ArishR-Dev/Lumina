/**
 * Contextual placeholder copy for Living Paper.
 * No AI — resolved from local time (and optional mood tag) at focus time.
 *
 * Voice: quiet, present, second-person. Never a question the page can't
 * hold; never chatbot phrasing. Short enough to disappear the moment
 * the user starts typing.
 */
export function resolveContextualPlaceholder(mood?: string): string {
  const m = (mood || "").toLowerCase();
  if (m.includes("sad") || m.includes("grief")) return "Some things are easier once they're written.";
  if (m.includes("happy") || m.includes("joy")) return "Keep the shape of this feeling.";
  if (m.includes("grateful") || m.includes("thanks")) return "Name what's staying with you.";
  if (m.includes("anxious") || m.includes("worry")) return "Let it out — the page is patient.";
  if (m.includes("tired") || m.includes("weary")) return "A few soft lines are enough.";
  if (m.includes("angry") || m.includes("frustrat")) return "Say it here first.";

  const hour = new Date().getHours();
  if (hour < 5) return "Quiet hours. Write freely.";
  if (hour < 12) return "Begin lightly. There's time.";
  if (hour < 17) return "One thought worth keeping.";
  if (hour < 22) return "Leave the day here, gently.";
  return "The page is listening.";
}
