import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/lumina/PageHeader";
import { GlassCard } from "@/components/lumina/GlassCard";
import { useLumina } from "@/lib/lumina-store";

export const Route = createFileRoute("/app/scratch")({ component: ScratchPage });

function ScratchPage() {
  const scratch = useLumina((s) => s.scratch);
  const setScratch = useLumina((s) => s.setScratch);
  const chars = scratch.length;
  const words = scratch.trim() ? scratch.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="one endless page"
        title="Scratch Pad"
        subtitle="A place for messy, wonderful drafts. Auto-saves as you type."
      />
      <GlassCard>
        <textarea
          value={scratch}
          onChange={(e) => setScratch(e.target.value)}
          placeholder="Doodle in words…"
          className="min-h-[60vh] w-full resize-none border-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-3 flex items-center justify-between border-t border-white/50 pt-3 text-[10px] uppercase tracking-widest text-muted-foreground dark:border-white/10">
          <span>Saved automatically</span>
          <span>
            {words} {words === 1 ? "word" : "words"} · {chars} {chars === 1 ? "char" : "chars"}
          </span>
        </div>
      </GlassCard>
    </div>
  );
}
