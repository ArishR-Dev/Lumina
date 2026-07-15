import { memo } from "react";
import { resolveMood, type CustomMood } from "@/lib/lumina-moods";
import { useLumina } from "@/lib/lumina-store";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

const EMOJI_SIZE: Record<Size, string> = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
  xl: "text-6xl",
};

type Props = {
  value: string | undefined | null;
  customMoods?: CustomMood[];
  size?: Size;
  showLabel?: boolean;
  className?: string;
  labelClassName?: string;
  fallback?: string;
};

/**
 * Universal mood renderer.  Every place in the app that displays a saved
 * mood value goes through this so the mood registry stays the only source
 * of truth for emoji / title / colour.
 */
export const MoodBadge = memo(function MoodBadge({
  value,
  customMoods,
  size = "md",
  showLabel = false,
  className,
  labelClassName,
  fallback = "—",
}: Props) {
  const storeCustom = useLumina((s) => s.customMoods);
  const mood = resolveMood(value, customMoods ?? storeCustom);
  if (!mood) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}>
        <span className={EMOJI_SIZE[size]}>{fallback}</span>
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      aria-label={mood.title}
      title={mood.title}
    >
      <span className={EMOJI_SIZE[size]} aria-hidden>
        {mood.emoji}
      </span>
      {showLabel && (
        <span className={cn("font-medium", labelClassName)}>{mood.title}</span>
      )}
    </span>
  );
});
