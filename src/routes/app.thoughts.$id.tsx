import { createFileRoute } from "@tanstack/react-router";
import { EntityDetail } from "@/components/lumina/EntityDetail";

function ThoughtDetailRoute() {
  const { id } = Route.useParams();
  return <EntityDetail kind="thought" id={id} />;
}

export const Route = createFileRoute("/app/thoughts/$id")({ component: ThoughtDetailRoute });
