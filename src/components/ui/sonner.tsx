import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Lumina-styled Sonner toaster.
 *
 * Uses the app's glass surface + primary glow instead of the default
 * green/red system look, and respects the bottom safe-area on mobile
 * so toasts never sit under the home indicator or the mobile nav.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          // Custom Lumina tokens (Sonner reads these CSS vars for the toast surface).
          "--normal-bg": "color-mix(in oklab, var(--card) 92%, transparent)",
          "--normal-text": "hsl(var(--foreground))",
          "--normal-border":
            "color-mix(in oklab, var(--primary) 25%, transparent)",
          "--success-bg": "color-mix(in oklab, var(--card) 92%, transparent)",
          "--success-text": "hsl(var(--foreground))",
          "--success-border":
            "color-mix(in oklab, var(--primary) 40%, transparent)",
          "--error-bg": "color-mix(in oklab, var(--card) 92%, transparent)",
          "--error-text": "hsl(var(--foreground))",
          "--error-border":
            "color-mix(in oklab, oklch(0.7 0.18 20) 40%, transparent)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast lumina-toast group-[.toaster]:rounded-2xl group-[.toaster]:border group-[.toaster]:backdrop-blur-xl group-[.toaster]:shadow-[0_16px_40px_-14px_color-mix(in_oklab,var(--primary)_35%,transparent)]",
          title: "group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-full",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-full",
          closeButton:
            "group-[.toast]:bg-white/70 group-[.toast]:border-white/60 dark:group-[.toast]:bg-white/10 dark:group-[.toast]:border-white/10",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
