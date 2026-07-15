import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AnimatePresence } from "framer-motion";
import { FarewellScene } from "@/components/farewell/FarewellScene";
import type { RitualId } from "@/lib/farewell/copy";
import { PICKABLE_KINDS, type EntityKind } from "@/lib/farewell/entities";

const searchSchema = z.object({
  ritual: fallback(z.string(), "fire").default("fire"),
});

const VALID: EntityKind[] = [...PICKABLE_KINDS, "custom"];

export const Route = createFileRoute("/app/farewell/$entity/$id")({
  ssr: false, // scene is client-only: AudioContext, localStorage
  validateSearch: zodValidator(searchSchema),
  beforeLoad: ({ params }) => {
    if (!VALID.includes(params.entity as EntityKind)) {
      throw redirect({ to: "/app/farewell", replace: true });
    }
  },
  component: FarewellRoute,
});

function FarewellRoute() {
  const { entity, id } = Route.useParams();
  const navigate = useNavigate();
  const kind = entity as EntityKind;
  const ritualId: RitualId = "fire";

  return (
    <AnimatePresence mode="wait">
      <FarewellScene
        key={`${entity}:${id}`}
        entityKind={kind}
        entityId={id}
        ritual={ritualId}
        onExit={() => navigate({ to: "/app/farewell", replace: true })}
      />
    </AnimatePresence>
  );
}

