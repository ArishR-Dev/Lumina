import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  emoji?: string;
  illustration?: ReactNode;
  title: string;
  message: string;
  ctaLabel?: string;
  to?: string;
  onClick?: () => void;
};

export function EmptyState({ emoji = "🌸", illustration, title, message, ctaLabel, to, onClick }: Props) {
  const cta = ctaLabel && (to ? (
    <Link to={to} className="lumina-focus-ring mt-6 inline-block rounded-full bg-primary/90 px-5 py-2 text-xs font-medium text-primary-foreground shadow-sm transition hover:scale-[1.02] hover:bg-primary">
      {ctaLabel}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className="lumina-focus-ring mt-6 inline-block rounded-full bg-primary/90 px-5 py-2 text-xs font-medium text-primary-foreground shadow-sm transition hover:scale-[1.02] hover:bg-primary">
      {ctaLabel}
    </button>
  ));
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass rounded-3xl p-10 text-center"
    >
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/60 text-4xl shadow-inner dark:bg-white/5">
        {illustration ?? <span aria-hidden>{emoji}</span>}
      </div>
      <h3 className="mt-5 font-display text-2xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      {cta}
    </motion.div>
  );
}