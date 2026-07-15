import { cn } from "@/lib/utils";

/** Cache-busted mark — single public source for in-app branding. */
export const LUMINA_LOGO_SRC = "/lumina-mark-512.png?v=evermore1";

type Props = {
  className?: string;
  /** Rendered pixel size (width & height). */
  size?: number;
  alt?: string;
  /** When true, alt is empty (icon next to visible brand text). */
  decorative?: boolean;
};

/**
 * Official Lumina Evermore mark — single UI source for product branding.
 */
export function LuminaLogo({
  className,
  size = 40,
  alt = "Lumina Evermore",
  decorative = false,
}: Props) {
  return (
    <img
      src={LUMINA_LOGO_SRC}
      alt={decorative ? "" : alt}
      width={size}
      height={size}
      className={cn(
        "select-none rounded-[28%] object-cover shadow-[0_10px_28px_-12px_rgba(90,40,120,0.55)]",
        className,
      )}
      draggable={false}
      decoding="async"
    />
  );
}
