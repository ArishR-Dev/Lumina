import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-8 flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end md:mb-10"
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground sm:text-[11px]">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl leading-[1.1] text-foreground sm:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base sm:leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="min-w-0 sm:shrink-0">{actions}</div>}
    </motion.header>
  );
}