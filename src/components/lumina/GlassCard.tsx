import { cn } from "@/lib/utils";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

export function GlassCard({ className, ...props }: HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      whileHover={reduce ? undefined : { y: -2 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 22 }}
      className={cn("glass lumina-lift rounded-3xl p-6", className)}
      {...props}
    />
  );
}
