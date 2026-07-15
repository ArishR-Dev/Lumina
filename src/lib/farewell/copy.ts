// Copy for every Farewell ritual. Kept in one file so tone can be reviewed
// as text before any animation work. All strings intentionally soft and
// non-clinical.

export type RitualId = "fire" | "water" | "wind" | "blossom" | "stardust" | "frost";

export type RitualCopy = {
  id: RitualId;
  name: string;
  hint: string;                 // short subtitle in chooser
  invitation: string;           // beat 2 prompt
  invitationCta: string;        // button label at point of no return
  transformation: string;       // beat 3 caption (very short)
  closing: string;              // beat 4 closing line
};

export const RITUALS: Record<RitualId, RitualCopy> = {
  fire: {
    id: "fire",
    name: "Fire",
    hint: "Let it burn away.",
    invitation: "When you are ready, let this rest.",
    invitationCta: "Release to the flame",
    transformation: "Breathe. Watch it go.",
    closing: "Some chapters are meant to end.",
  },
  water: { id: "water", name: "Water", hint: "Let it dissolve.", invitation: "", invitationCta: "", transformation: "", closing: "" },
  wind: { id: "wind", name: "Wind", hint: "Let it drift.", invitation: "", invitationCta: "", transformation: "", closing: "" },
  blossom: { id: "blossom", name: "Blossom", hint: "Let it bloom away.", invitation: "", invitationCta: "", transformation: "", closing: "" },
  stardust: { id: "stardust", name: "Stardust", hint: "Let it return to light.", invitation: "", invitationCta: "", transformation: "", closing: "" },
  frost: { id: "frost", name: "Frost", hint: "Let it still.", invitation: "", invitationCta: "", transformation: "", closing: "" },
};

// M1: only Fire is enabled. Keep the shape so future rituals plug in.
export const ENABLED_RITUALS: RitualId[] = ["fire"];
